import { Injectable } from '@nestjs/common';
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
};

/** O que volta do banco. `createdAt` não entra: ninguém precisa dele hoje. */
export type StoredLeague = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
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
   * Cria a liga **e** a participação de quem criou.
   *
   * O write aninhado do Prisma roda os dois INSERT numa única transação: ou
   * existe liga com o criador dentro, ou não existe liga. Liga órfã, sem
   * ninguém, nunca chega a ser gravada — e é por isso que as duas escritas
   * ficam em uma chamada só, em vez de duas sequenciais.
   */
  async create(league: NewLeague): Promise<StoredLeague> {
    // Se um dia existir exclusão de conta, o id do criador pode não existir
    // mais no meio desta requisição e o Postgres recusa a chave estrangeira
    // (P2003). Hoje não há como apagar conta, então não há erro de domínio para
    // esse caso: criar um agora seria tratar um cenário que não existe.
    return await this.prisma.league.create({
      data: {
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
        participants: { create: { userId: league.creatorId } },
      },
      // `select` explícito, como no módulo de contas: coluna nova no banco não
      // passa a sair da camada de dados sem alguém decidir.
      select: { id: true, name: true, startsAt: true, endsAt: true },
    });
  }

  /**
   * Ligas de que a pessoa participa.
   *
   * O filtro por participação **é** a autorização da listagem: não existe aqui
   * consulta que devolva liga de que a pessoa não participa, então não há como
   * uma rota esquecer de filtrar e vazar liga alheia.
   *
   * Sem `orderBy`: a ordem da lista depende da situação de cada liga, que é
   * calculada no service (ver league-status.ts). Ordenar aqui por data daria uma
   * ordem que o service refaz em seguida.
   */
  async findByParticipant(userId: string): Promise<StoredLeague[]> {
    return await this.prisma.league.findMany({
      where: { participants: { some: { userId } } },
      select: { id: true, name: true, startsAt: true, endsAt: true },
    });
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
   * Uma liga pelo id, ou `null`. **Não filtra por participação** — é o único
   * método aqui que não filtra, e por isso só pode ser chamado depois de a
   * autorização passar no service.
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
   * Consome o convite: cria a participação **e** apaga o convite, numa única
   * transação. Ou a pessoa está na liga e o convite sumiu, ou nada aconteceu —
   * nunca sobra convite aceito que não virou participação.
   *
   * Devolve `false` quando o convite já não estava disponível no instante da
   * escrita: alguém respondeu em paralelo, ou a liga encerrou entre a leitura e
   * o commit.
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
  ): Promise<boolean> {
    return await this.prisma.$transaction(async (tx) => {
      // Todas as operações usam o client da transação (`tx`), nunca
      // `this.prisma`: uma chamada ao client global aqui ficaria fora da
      // transação e quebraria a atomicidade sem erro aparente.
      const consumed = await tx.leagueInvite.deleteMany({
        where: {
          id: invite.id,
          invitedUserId: userId,
          league: { endsAt: { gte: notFinishedAt } },
        },
      });

      if (consumed.count === 0) return false;

      try {
        await tx.leagueParticipant.create({
          data: { leagueId: invite.leagueId, userId },
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

      return true;
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
