import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Participação de alguém numa liga, com o que a regra da ordem precisa saber
 * antes de decidir: o saldo e o período da liga.
 *
 * Numa consulta só, e não uma para a participação e outra para a liga: duas
 * idas ao banco poderiam discordar entre si se algo mudasse no intervalo.
 */
export type ParticipantContext = {
  /** Id da linha de participação — é ele que a ordem referencia. */
  participantId: string;
  /** Saldo em dinheiro desta pessoa nesta liga, em texto decimal. */
  cashBalance: string;
  startsAt: Date;
  endsAt: Date;
};

/** O que sobrou depois de a compra ser executada. */
export type ExecutedBuy = {
  orderId: string;
  executedAt: Date;
  /** Saldo **depois** do débito, em texto decimal. */
  cashBalance: string;
  /** Quantidade total do ativo em carteira depois da compra. */
  positionQuantity: string;
};

/** O que o domínio manda executar. Preço e custo já vêm decididos pela regra. */
export type BuyToExecute = {
  participantId: string;
  symbol: string;
  quantity: string;
  unitPrice: string;
  /** Já truncado na oitava casa pelo domínio (ver order-cost.ts). */
  totalCost: string;
};

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
   */
  async findParticipantContext(
    leagueId: string,
    userId: string,
  ): Promise<ParticipantContext | null> {
    const participant = await this.prisma.leagueParticipant.findUnique({
      // Usa o índice único `(league_id, user_id)` — a mesma chave que impede
      // participação duplicada.
      where: { leagueId_userId: { leagueId, userId } },
      select: {
        id: true,
        cashBalance: true,
        league: { select: { startsAt: true, endsAt: true } },
      },
    });

    if (!participant) return null;

    // Achata o join: nenhuma forma aninhada do Prisma atravessa para o service.
    return {
      participantId: participant.id,
      cashBalance: toDecimalText(participant.cashBalance),
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
  async executeBuy(buy: BuyToExecute): Promise<ExecutedBuy | null> {
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
}
