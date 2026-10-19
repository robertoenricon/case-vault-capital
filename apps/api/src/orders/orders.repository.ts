import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Participação de alguém numa liga, com o que a regra da ordem precisa saber
 * antes de decidir: o saldo, a carteira no ativo e o período da liga.
 *
 * Numa consulta só, e não uma para a participação, outra para a liga e outra
 * para a posição: idas separadas ao banco poderiam discordar entre si se algo
 * mudasse no intervalo.
 */
export type ParticipantContext = {
  /** Id da linha de participação — é ele que a ordem referencia. */
  participantId: string;
  /** Saldo em dinheiro desta pessoa nesta liga, em texto decimal. */
  cashBalance: string;
  /**
   * Quantidade do ativo em carteira nesta liga, em texto decimal. `"0"` para
   * quem nunca comprou: a ausência de linha em `positions` é traduzida aqui,
   * e não no service, para que a regra compare sempre dois números.
   */
  positionQuantity: string;
  startsAt: Date;
  endsAt: Date;
};

/** O que sobrou depois de a ordem ser executada. */
export type OrderOutcome = {
  orderId: string;
  executedAt: Date;
  /** Saldo **depois** do débito ou do crédito, em texto decimal. */
  cashBalance: string;
  /** Quantidade do ativo em carteira depois da ordem. */
  positionQuantity: string;
};

/** O que o domínio manda executar. Preço e valor já vêm decididos pela regra. */
export type OrderToExecute = {
  participantId: string;
  symbol: string;
  quantity: string;
  unitPrice: string;
  /**
   * Valor da ordem, já truncado na oitava casa pelo domínio (ver
   * order-cost.ts): é quanto sai do saldo na compra e quanto entra nele na
   * venda. O nome acompanha a coluna `total_cost`, que guarda os dois lados.
   */
  totalCost: string;
};

/**
 * A posição não cobriu a venda no instante da escrita.
 *
 * Existe para **abortar a transação**: a `$transaction` do Prisma só desfaz o
 * que já foi escrito se o callback lançar — um `return null` ali dentro
 * confirmaria o crédito que a venda tinha acabado de fazer. É um sinal
 * interno, capturado alguns pontos acima e convertido em `null`; nunca sai
 * deste arquivo.
 */
class PositionDidNotCover extends Error {}

/**
 * Coluna `numeric` do Postgres para texto decimal. Mesma função — e mesmos
 * motivos — do repositório de ligas: nada do ORM atravessa daqui para o
 * service, e `toFixed()` sem argumento evita a notação exponencial que o
 * `toString()` do decimal.js produziria em valores extremos.
 */
function toDecimalText(value: Prisma.Decimal): string {
  return value.toFixed();
}

/**
 * Único lugar que fala com o Prisma no módulo de ordens.
 *
 * Escreve em `league_participants`, que é tabela "de ligas", e isso é
 * deliberado: o débito do saldo, a atualização da posição e o registro da
 * ordem precisam estar na **mesma transação**, e atravessar o client dela por
 * outro módulo vazaria o limite da transação para fora daqui. O preço assumido
 * é que dois módulos escrevem na mesma tabela; a alternativa era uma
 * atomicidade só aparente.
 */
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A participação de alguém numa liga, ou `null` se ela não existe.
   *
   * O filtro por `userId` **é** a autorização: não existe aqui consulta que
   * devolva a participação de outra pessoa. Liga inexistente e liga de que a
   * pessoa não participa caem no mesmo `null` — quem decide o que isso
   * significa (e que os dois casos respondem igual) é o service.
   *
   * A posição vem junto, filtrada pelo ativo da ordem. A compra não chega a
   * usá-la, e isso é aceito de propósito: o custo é uma relação a mais no
   * mesmo `select`, e duas funções quase iguais — uma com carteira e outra
   * sem — custariam mais para ler do que o campo ignorado.
   */
  async findParticipantContext(
    leagueId: string,
    userId: string,
    symbol: string,
  ): Promise<ParticipantContext | null> {
    const participant = await this.prisma.leagueParticipant.findUnique({
      // Usa o índice único `(league_id, user_id)` — a mesma chave que impede
      // participação duplicada.
      where: { leagueId_userId: { leagueId, userId } },
      select: {
        id: true,
        cashBalance: true,
        league: { select: { startsAt: true, endsAt: true } },
        // No máximo uma linha: `(participant_id, symbol)` é único.
        positions: { where: { symbol }, select: { quantity: true } },
      },
    });

    if (!participant) return null;

    const position = participant.positions[0];

    // Achata o join: nenhuma forma aninhada do Prisma atravessa para o service.
    return {
      participantId: participant.id,
      cashBalance: toDecimalText(participant.cashBalance),
      positionQuantity: position ? toDecimalText(position.quantity) : '0',
      startsAt: participant.league.startsAt,
      endsAt: participant.league.endsAt,
    };
  }

  /**
   * Executa a compra: debita o saldo, soma na posição e registra a ordem —
   * tudo numa transação. Ou as três coisas aconteceram, ou nenhuma.
   *
   * Devolve `null` quando o saldo não cobriu o custo **no instante da
   * escrita**. O service já conferiu o saldo antes, com uma leitura; este
   * `null` é a corrida: duas ordens da mesma pessoa chegando juntas, as duas
   * passando pela conferência e só uma podendo gastar o dinheiro.
   *
   * A corrida é resolvida por **escrita condicional**, não por lock explícito,
   * como no aceite de convite: o `updateMany` leva `cashBalance >= totalCost`
   * no `where` e o Postgres responde quantas linhas casaram. `count: 0`
   * significa que o saldo mudou entre a leitura e a escrita.
   *
   * A ordem das operações não é arbitrária. O débito vem **primeiro** de
   * propósito: é ele que pega o lock da linha de participação, e é esse lock
   * que serializa duas ordens simultâneas da mesma pessoa. Com ele seguro, o
   * `upsert` da posição não tem como correr contra si mesmo — duas compras
   * concorrentes do mesmo participante nunca chegam juntas ao upsert.
   */
  async executeBuy(buy: OrderToExecute): Promise<OrderOutcome | null> {
    return await this.prisma.$transaction(async (tx) => {
      // Todas as operações usam o client da transação (`tx`), nunca
      // `this.prisma`: uma chamada ao client global aqui ficaria fora da
      // transação e quebraria a atomicidade sem erro aparente.

      const debited = await tx.leagueParticipant.updateMany({
        where: {
          id: buy.participantId,
          // A condição que impede saldo negativo. Não é uma segunda
          // conferência "por garantia": é **a** garantia — a do service é só
          // para a mensagem de erro ficar boa.
          cashBalance: { gte: buy.totalCost },
        },
        data: { cashBalance: { decrement: buy.totalCost } },
      });

      if (debited.count === 0) return null;

      // Soma na posição que já existe, ou cria a primeira. O `increment` é
      // feito pelo banco, não lido-e-reescrito pela aplicação: ler, somar em
      // memória e gravar abriria a janela que o lock acima fecha.
      const position = await tx.position.upsert({
        where: {
          participantId_symbol: {
            participantId: buy.participantId,
            symbol: buy.symbol,
          },
        },
        create: {
          participantId: buy.participantId,
          symbol: buy.symbol,
          quantity: buy.quantity,
        },
        update: { quantity: { increment: buy.quantity } },
        select: { quantity: true },
      });

      const order = await tx.order.create({
        data: {
          participantId: buy.participantId,
          side: 'buy',
          symbol: buy.symbol,
          quantity: buy.quantity,
          unitPrice: buy.unitPrice,
          // O custo gravado é o mesmo que debitou o saldo, não um recálculo:
          // é o que faz o extrato fechar com a carteira.
          totalCost: buy.totalCost,
        },
        select: { id: true, executedAt: true },
      });

      // O saldo é relido dentro da transação em vez de calculado aqui: quem
      // subtraiu foi o Postgres, e é o número dele que a tela precisa mostrar.
      const participant = await tx.leagueParticipant.findUniqueOrThrow({
        where: { id: buy.participantId },
        select: { cashBalance: true },
      });

      return {
        orderId: order.id,
        executedAt: order.executedAt,
        cashBalance: toDecimalText(participant.cashBalance),
        positionQuantity: toDecimalText(position.quantity),
      };
    });
  }

  /**
   * Executa a venda: credita o saldo, baixa a posição e registra a ordem —
   * tudo numa transação, espelhando a compra.
   *
   * Devolve `null` quando a carteira não cobriu a quantidade **no instante da
   * escrita**: é a mesma corrida do saldo, do outro lado. A garantia de que
   * ninguém vende o que não tem é a escrita condicional `quantity >= vendido`,
   * não a conferência do service — e é ela também que faz a posição nunca
   * ficar negativa, já que venda a descoberto não existe neste produto.
   *
   * **A ordem das operações é a mesma da compra, e isso não é detalhe.** O
   * natural aqui seria baixar a posição primeiro e creditar depois, já que a
   * posição é a condição. Mas a compra trava `league_participants` e depois
   * `positions`; uma venda que travasse na ordem inversa poderia cruzar com
   * uma compra da mesma pessoa e as duas ficariam esperando uma pela outra —
   * deadlock, que o Postgres resolve matando uma transação e a pessoa vê como
   * erro inexplicável. Travando sempre na mesma ordem, o cruzamento vira
   * espera e depois sucesso.
   *
   * O custo dessa escolha é creditar antes de saber se a venda vale: se a
   * posição não cobrir, a transação inteira é desfeita pelo `throw`. Nada
   * chega a ser confirmado.
   *
   * Posição zerada **mantém a linha**, com quantidade `0`, em vez de apagá-la:
   * quem leu zero e quem nunca comprou enxergam o mesmo número, e apagar
   * obrigaria a próxima compra a recriar a linha sem necessidade.
   */
  async executeSell(sell: OrderToExecute): Promise<OrderOutcome | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        /*
         * Crédito primeiro, para pegar o lock da participação na mesma ordem
         * que a compra pega (ver acima). É `update` e não `updateMany`: aqui
         * não há condição a satisfazer — creditar sempre cabe — e se a linha
         * tiver sumido entre a leitura e a escrita, é melhor a transação
         * estourar alto do que creditar no vazio em silêncio.
         */
        await tx.leagueParticipant.update({
          where: { id: sell.participantId },
          data: { cashBalance: { increment: sell.totalCost } },
        });

        const sold = await tx.position.updateMany({
          where: {
            participantId: sell.participantId,
            symbol: sell.symbol,
            // A condição que impede posição negativa — a garantia de verdade
            // de que não existe venda a descoberto. Vale também para quem
            // nunca comprou: sem linha em `positions`, nada casa.
            quantity: { gte: sell.quantity },
          },
          data: { quantity: { decrement: sell.quantity } },
        });

        if (sold.count === 0) throw new PositionDidNotCover();

        const order = await tx.order.create({
          data: {
            participantId: sell.participantId,
            side: 'sell',
            symbol: sell.symbol,
            quantity: sell.quantity,
            unitPrice: sell.unitPrice,
            // Na venda, `total_cost` é o valor **recebido**. Mesma coluna dos
            // dois lados, e é o `side` que diz a direção do dinheiro.
            totalCost: sell.totalCost,
          },
          select: { id: true, executedAt: true },
        });

        // Saldo e posição relidos dentro da transação, pelo mesmo motivo da
        // compra: quem fez as contas foi o Postgres.
        const participant = await tx.leagueParticipant.findUniqueOrThrow({
          where: { id: sell.participantId },
          select: { cashBalance: true },
        });

        const position = await tx.position.findUniqueOrThrow({
          where: {
            participantId_symbol: {
              participantId: sell.participantId,
              symbol: sell.symbol,
            },
          },
          select: { quantity: true },
        });

        return {
          orderId: order.id,
          executedAt: order.executedAt,
          cashBalance: toDecimalText(participant.cashBalance),
          positionQuantity: toDecimalText(position.quantity),
        };
      });
    } catch (failure) {
      // Só o sinal interno vira `null`. Qualquer outra falha — banco fora,
      // deadlock, linha sumida — continua subindo: engoli-la aqui faria uma
      // venda que falhou parecer uma venda recusada por carteira vazia.
      if (failure instanceof PositionDidNotCover) return null;
      throw failure;
    }
  }
}
