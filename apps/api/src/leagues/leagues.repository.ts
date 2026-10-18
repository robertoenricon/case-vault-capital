import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
