import { Injectable } from '@nestjs/common';
import { BITCOIN } from '../common/assets.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  InvitedUserNotFoundError,
  LeagueInviteAlreadySentError,
  UserAlreadyInLeagueError,
} from './leagues.errors.js';

/** O que o domínio manda gravar. Os instantes já vêm decididos pela regra. */
export type NewLeague = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  /** Quem criou. Entra como participante junto da liga, não depois. */
  creatorId: string;
  /**
   * Saldo fictício com que todo participante desta liga vai começar, em texto
   * decimal. A liga guarda este valor; quem decide qual é ele é o service.
   */
  initialBalance: string;
};

/** O que volta do banco. `createdAt` não entra: ninguém precisa dele hoje. */
export type StoredLeague = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * A liga **mais o saldo de quem está olhando** nela.
 *
 * São dois dados de tabelas diferentes, e o tipo diz isso: o saldo não é
 * atributo da liga (cada participante tem o seu), é da participação. Quem
 * recebe este tipo está sempre olhando a liga pelos olhos de uma pessoa.
 */
export type StoredParticipantLeague = StoredLeague & {
  /**
   * Saldo em dinheiro desta pessoa nesta liga, em texto decimal — ver
   * `toDecimalText`.
   */
  cashBalance: string;
};

/**
 * Convite pendente, já com os dados da liga que a tela precisa mostrar.
 *
 * O nome e o período vêm por join, não copiados para a tabela de convites:
 * copiar criaria duas verdades para o mesmo dado. Quem convidou **não** está
 * aqui porque não é coluna — a liga não tem dono, e registrar o remetente seria
 * uma decisão de produto que ninguém pediu.
 */
export type StoredInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Participante como a lista da liga precisa dele: quem é, quanto tem em caixa
 * e quanto tem em bitcoin.
 *
 * O nome vem por join de `users`, nunca copiado para a tabela de participação
 * (ver schema.prisma) — copiar criaria duas verdades para o mesmo dado, e a
 * cópia envelheceria no dia em que a pessoa trocasse o nome. A posição vem por
 * join de `positions`, pelo mesmo motivo.
 *
 * `joinedAt` **não** sai: a tela mostra nome, saldo e posição, por decisão
 * registrada. O campo existe na tabela e serve à ordenação, mas não atravessa
 * esta camada enquanto ninguém o exibir.
 */
export type StoredParticipant = {
  /**
   * Id da **conta**, não da participação. É o id que a aplicação já usa para
   * falar de pessoas (o convite recebe este) — o da linha de participação não
   * serviria para nada fora do banco.
   */
  userId: string;
  name: string;
  /** Saldo em dinheiro desta pessoa nesta liga, em texto decimal. */
  cashBalance: string;
  /**
   * Bitcoin que esta pessoa tem em carteira nesta liga, em texto decimal.
   *
   * `"0"` quando ela nunca comprou: não existe linha em `positions` antes da
   * primeira ordem, e "não tem posição" e "tem zero" são a mesma coisa para
   * quem lê a lista. Traduzir a ausência aqui evita que cada tela invente o
   * próprio jeito de mostrar o nada.
   *
   * Um campo para bitcoin, e não um mapa de ativos, porque só existe um ativo
   * negociável. Quando o catálogo abrir, isto vira uma lista e o compilador
   * aponta todos os pontos a ajustar.
   */
  bitcoinQuantity: string;
};

/**
 * Coluna `numeric` do Postgres para texto decimal.
 *
 * O driver entrega `numeric` como `Decimal` (decimal.js, embutido no Prisma), e
 * é esta função que impede esse tipo de atravessar para o service — mesma regra
 * do resto do arquivo: nada do ORM sai daqui.
 *
 * Texto e não `number`: `toNumber()` jogaria o saldo num ponto flutuante
 * binário, onde 0.1 + 0.2 não dá 0.3. O valor segue como string exata até a
 * tela, que só o formata.
 *
 * `toFixed()` sem argumento, e não `toString()`: para valores muito grandes ou
 * muito pequenos o `toString()` do decimal.js devolve notação exponencial
 * (`1e+21`), que nem a tela nem uma futura conta de dinheiro saberiam ler.
 */
function toDecimalText(value: Prisma.Decimal): string {
  return value.toFixed();
}

/** Violação de índice único no Postgres, pelo código de erro do Prisma. */
const UNIQUE_VIOLATION = 'P2002';

/** Violação de chave estrangeira: o id apontado não existe. */
const FOREIGN_KEY_VIOLATION = 'P2003';

/**
 * Único lugar que fala com o Prisma no módulo. Nenhum tipo do ORM atravessa
 * daqui para o service.
 */
@Injectable()
export class LeaguesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a liga **e** a participação de quem criou, já com o saldo inicial.
   *
   * O write aninhado do Prisma roda os dois INSERT numa única transação: ou
   * existe liga com o criador dentro, ou não existe liga. Liga órfã, sem
   * ninguém, nunca chega a ser gravada — e é por isso que as duas escritas
   * ficam em uma chamada só, em vez de duas sequenciais. O saldo entra na mesma
   * transação pelo mesmo motivo: participante sem saldo seria estado pela
   * metade, e a tela mostraria carteira vazia numa liga que nem começou.
   *
   * O mesmo `initialBalance` vai para as duas linhas de propósito: a liga
   * guarda a base de comparação do ranking, e a participação, o dinheiro que
   * vai ser gasto. Começam iguais e separam na primeira ordem.
   */
  async create(league: NewLeague): Promise<StoredParticipantLeague> {
    // Se um dia existir exclusão de conta, o id do criador pode não existir
    // mais no meio desta requisição e o Postgres recusa a chave estrangeira
    // (P2003). Hoje não há como apagar conta, então não há erro de domínio para
    // esse caso: criar um agora seria tratar um cenário que não existe.
    const created = await this.prisma.league.create({
      data: {
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
        // String decimal, nunca `number`: o Prisma aceita texto em coluna
        // `numeric` e o valor chega ao banco exatamente como foi configurado.
        initialBalance: league.initialBalance,
        participants: {
          create: {
            userId: league.creatorId,
            cashBalance: league.initialBalance,
          },
        },
      },
      // `select` explícito, como no módulo de contas: coluna nova no banco não
      // passa a sair da camada de dados sem alguém decidir.
      select: { id: true, name: true, startsAt: true, endsAt: true },
    });

    // O saldo devolvido é o que acabou de ser gravado, não uma segunda consulta:
    // quem criou a liga começa com a base dela, e é este o valor que a tela
    // mostra no card logo após a criação.
    return { ...created, cashBalance: league.initialBalance };
  }

  /**
   * Ligas de que a pessoa participa, **cada uma com o saldo dela ali**.
   *
   * O filtro por participação **é** a autorização da listagem: não existe aqui
   * consulta que devolva liga de que a pessoa não participa, então não há como
   * uma rota esquecer de filtrar e vazar liga alheia.
   *
   * O saldo vem no mesmo `select`, por um join filtrado pelo mesmo `userId` —
   * nunca o saldo de outra pessoa. Numa consulta só, e não uma por liga: com a
   * carteira buscada à parte, seriam N+1 idas ao banco para montar uma tela.
   *
   * Sem `orderBy`: a ordem da lista depende da situação de cada liga, que é
   * calculada no service (ver league-status.ts). Ordenar aqui por data daria uma
   * ordem que o service refaz em seguida.
   */
  async findByParticipant(userId: string): Promise<StoredParticipantLeague[]> {
    const leagues = await this.prisma.league.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        // O `where` repetido aqui é o que garante que o saldo é o de quem está
        // perguntando: sem ele, viriam as participações de toda a liga.
        participants: {
          where: { userId },
          select: { cashBalance: true },
        },
      },
    });

    // Achata o join. A participação existe sempre — é ela que faz a liga entrar
    // nesta lista —, então o `[0]` não é aposta: é a mesma linha que o `where`
    // de cima usou para filtrar.
    return leagues.map(({ participants, ...league }) => ({
      ...league,
      cashBalance: toDecimalText(participants[0].cashBalance),
    }));
  }

  /**
   * Ids de quem participa da liga.
   *
   * Uma consulta serve a dois usos no service: dizer se quem está chamando
   * participa (autorização) e marcar, na lista de candidatos, quem já está
   * dentro. Duas consultas separadas para isso poderiam discordar entre si se
   * alguém entrasse na liga no meio do caminho.
   *
   * Liga inexistente devolve lista vazia, e não erro: quem decide o que isso
   * significa é o service.
   */
  async findParticipantUserIds(leagueId: string): Promise<string[]> {
    const participants = await this.prisma.leagueParticipant.findMany({
      where: { leagueId },
      select: { userId: true },
    });

    return participants.map((participant) => participant.userId);
  }

  /**
   * Quem participa da liga, com o nome de cada um, **na ordem de entrada**.
   *
   * A ordem é decisão de produto: quem criou a liga entrou junto com ela, então
   * é sempre o primeiro da lista — é o que recupera na tela o "dono" que a
   * modelagem decidiu não gravar como coluna. O desempate pelo id existe porque
   * a liga e a participação do criador saem de um único INSERT: com `joinedAt`
   * idêntico, a ordem ficaria à mercê do que o Postgres devolvesse primeiro, e
   * o id é UUID v7 (crescente no tempo).
   *
   * Ordenar aqui, e não no service como na listagem de ligas, porque esta ordem
   * o banco conhece: ela depende de coluna, não da situação calculada.
   *
   * Não filtra por quem está pedindo — e aqui isso não é brecha: é **esta**
   * consulta que dá a autorização no service (quem pede tem de estar na lista),
   * em vez de uma segunda consulta que poderia discordar dela.
   */
  async findParticipants(leagueId: string): Promise<StoredParticipant[]> {
    const participants = await this.prisma.leagueParticipant.findMany({
      where: { leagueId },
      // `select` explícito dos três lados do join: nem coluna nova de
      // participação, nem de conta, nem de posição passa a sair sem alguém
      // decidir.
      select: {
        userId: true,
        cashBalance: true,
        user: { select: { name: true } },
        /*
         * A posição vem no mesmo `select`, e não numa busca por participante.
         *
         * O Prisma não resolve isto como um JOIN: ele dispara uma consulta por
         * relação (participações, contas, posições), cada uma com um `IN` dos
         * ids. São três idas ao banco, **constantes** — não crescem com o
         * tamanho da liga, que é o que importa aqui. Buscar a carteira de cada
         * um à parte, sim, seria N+1.
         *
         * `positions` é escrita pelo módulo de ordens e lida aqui. São dois
         * módulos na mesma tabela, como já acontece com `league_participants`
         * no sentido inverso. A alternativa seria o módulo de ordens expor um
         * serviço de leitura e este importá-lo — mais indireção e uma consulta
         * a mais, para um dado que esta já traz. Quando o ranking existir,
         * esta leitura provavelmente vira o começo de um read model próprio.
         */
        positions: {
          where: { symbol: BITCOIN },
          select: { quantity: true },
        },
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });

    // Achata o join: nenhuma forma aninhada do Prisma atravessa para o service,
    // e o `Decimal` do saldo vira texto aqui, não lá.
    return participants.map((participant) => ({
      userId: participant.userId,
      name: participant.user.name,
      cashBalance: toDecimalText(participant.cashBalance),
      // O `where` acima limita a no máximo uma linha (o único é
      // `participant_id + symbol`). Vazio = nunca comprou, que a lista mostra
      // como zero.
      bitcoinQuantity: participant.positions[0]
        ? toDecimalText(participant.positions[0].quantity)
        : '0',
    }));
  }

  /**
   * Uma liga pelo id, ou `null`. **Não filtra por participação** — e, diferente
   * de `findParticipants`, não é ela quem autoriza nada, então só pode ser
   * chamada depois de a autorização passar no service.
   *
   * Existe para o convite: é preciso saber o período da liga para decidir se
   * ela já encerrou.
   */
  async findById(leagueId: string): Promise<StoredLeague | null> {
    return await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, startsAt: true, endsAt: true },
    });
  }

  /** Ids de quem tem convite pendente nesta liga, para a lista de candidatos. */
  async findInvitedUserIds(leagueId: string): Promise<string[]> {
    const invites = await this.prisma.leagueInvite.findMany({
      where: { leagueId },
      select: { invitedUserId: true },
    });

    return invites.map((invite) => invite.invitedUserId);
  }

  /**
   * Cria o convite pendente.
   *
   * Traduz as duas recusas do banco em erro de domínio: índice único (convite
   * repetido) e chave estrangeira (conta que não existe). Sem isso, as duas
   * virariam 500 sem explicação.
   */
  async createInvite(leagueId: string, invitedUserId: string): Promise<void> {
    try {
      await this.prisma.leagueInvite.create({
        data: { leagueId, invitedUserId },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === UNIQUE_VIOLATION) {
          throw new LeagueInviteAlreadySentError(leagueId, invitedUserId);
        }
        if (error.code === FOREIGN_KEY_VIOLATION) {
          throw new InvitedUserNotFoundError(invitedUserId);
        }
      }
      throw error;
    }
  }

  /**
   * Convites pendentes da pessoa, com os dados da liga de cada um.
   *
   * O filtro por `invitedUserId` **é** a autorização da listagem: não existe
   * consulta aqui que devolva convite de outra pessoa.
   *
   * Sem `orderBy` de situação, como na listagem de ligas: o id é UUID v7, então
   * ordenar por ele é ordenar por data de criação — o convite mais antigo
   * primeiro, que é a ordem em que a pessoa os recebeu.
   */
  async findPendingInvitesForUser(userId: string): Promise<StoredInvite[]> {
    const invites = await this.prisma.leagueInvite.findMany({
      where: { invitedUserId: userId },
      select: {
        id: true,
        leagueId: true,
        league: { select: { name: true, startsAt: true, endsAt: true } },
      },
      orderBy: { id: 'asc' },
    });

    // Achata o join: nenhum tipo do Prisma (nem a forma aninhada dele)
    // atravessa daqui para o service.
    return invites.map((invite) => ({
      id: invite.id,
      leagueId: invite.leagueId,
      leagueName: invite.league.name,
      startsAt: invite.league.startsAt,
      endsAt: invite.league.endsAt,
    }));
  }

  /** Um convite da pessoa, ou `null` se não existe ou não é dela. */
  async findInviteForUser(
    inviteId: string,
    userId: string,
  ): Promise<StoredInvite | null> {
    const invite = await this.prisma.leagueInvite.findFirst({
      // O `invitedUserId` no `where` é a autorização: convite alheio não é
      // encontrado, em vez de ser encontrado e recusado depois.
      where: { id: inviteId, invitedUserId: userId },
      select: {
        id: true,
        leagueId: true,
        league: { select: { name: true, startsAt: true, endsAt: true } },
      },
    });

    if (!invite) return null;

    return {
      id: invite.id,
      leagueId: invite.leagueId,
      leagueName: invite.league.name,
      startsAt: invite.league.startsAt,
      endsAt: invite.league.endsAt,
    };
  }

  /**
   * Consome o convite: cria a participação **com o saldo inicial da liga** e
   * apaga o convite, numa única transação. Ou a pessoa está na liga, com
   * dinheiro para operar, e o convite sumiu, ou nada aconteceu — nunca sobra
   * convite aceito que não virou participação, nem participante sem saldo.
   *
   * O saldo sai de `leagues.initial_balance`, **não** da configuração do
   * ambiente: é o que faz quem entra no meio da liga começar com o mesmo valor
   * de quem a criou, mesmo que o padrão tenha mudado no intervalo. Lido dentro
   * da transação, junto da escrita que o usa.
   *
   * Devolve `null` quando o convite já não estava disponível no instante da
   * escrita: alguém respondeu em paralelo, ou a liga encerrou entre a leitura e
   * o commit. Quando dá certo, devolve o saldo com que a pessoa entrou — a tela
   * mostra a liga logo depois, e buscá-lo de novo seria uma segunda consulta
   * para um valor que esta já tem.
   *
   * A corrida é resolvida por **escrita condicional**, não por lock: o
   * `deleteMany` leva no `where` tudo o que precisa valer (o convite é desta
   * pessoa e a liga não encerrou) e o Postgres responde quantas linhas casaram.
   * Dois cliques simultâneos em "Participar" chegam aqui, um apaga a linha e o
   * outro recebe `count: 0` — sem `SELECT ... FOR UPDATE` e sem o risco de
   * esquecer de segurar o lock.
   *
   * @param notFinishedAt instante que a liga precisa não ter ultrapassado. Vem
   * do service, que é onde o tempo entra no sistema — o repositório não chama
   * `new Date()`.
   */
  async consumeInvite(
    invite: { id: string; leagueId: string },
    userId: string,
    notFinishedAt: Date,
  ): Promise<string | null> {
    return await this.prisma.$transaction(async (tx) => {
      // Todas as operações usam o client da transação (`tx`), nunca
      // `this.prisma`: uma chamada ao client global aqui ficaria fora da
      // transação e quebraria a atomicidade sem erro aparente.

      // A base da liga é lida **antes** de qualquer escrita de propósito: se a
      // liga não estiver mais lá, a transação termina sem ter mexido em nada.
      // Na ordem inversa, o convite já estaria apagado e sair daqui exigiria um
      // `throw` só para desfazer o que não devia ter começado.
      const league = await tx.league.findUnique({
        where: { id: invite.leagueId },
        select: { initialBalance: true },
      });

      if (!league) return null;

      const consumed = await tx.leagueInvite.deleteMany({
        where: {
          id: invite.id,
          invitedUserId: userId,
          league: { endsAt: { gte: notFinishedAt } },
        },
      });

      if (consumed.count === 0) return null;

      try {
        await tx.leagueParticipant.create({
          data: {
            leagueId: invite.leagueId,
            userId,
            // O saldo da pessoa começa igual à base da liga. As duas colunas
            // existem porque daqui para frente elas divergem: esta é gasta nas
            // ordens, aquela continua sendo a referência do ranking.
            cashBalance: league.initialBalance,
          },
          select: { id: true },
        });
      } catch (error) {
        // A pessoa já participava e ainda havia convite pendente para ela. O
        // índice único é quem impede a linha duplicada; o `throw` desfaz a
        // transação, então o convite volta a existir e ela pode recusá-lo.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          throw new UserAlreadyInLeagueError(invite.leagueId, userId);
        }
        throw error;
      }

      return toDecimalText(league.initialBalance);
    });
  }

  /**
   * Apaga o convite (recusa). Devolve `false` quando não havia convite dessa
   * pessoa com esse id.
   *
   * Recusar não guarda nada: a linha simplesmente deixa de existir. É decisão
   * registrada — sem histórico, a pessoa pode ser convidada de novo depois sem
   * nenhuma regra extra para decidir.
   */
  async deleteInviteForUser(
    inviteId: string,
    userId: string,
  ): Promise<boolean> {
    // `deleteMany` e não `delete`: com o id de outra pessoa, `delete` lançaria
    // P2025 e `deleteMany` devolve `count: 0`, que é a resposta que o service
    // sabe traduzir.
    const deleted = await this.prisma.leagueInvite.deleteMany({
      where: { id: inviteId, invitedUserId: userId },
    });

    return deleted.count > 0;
  }
}
