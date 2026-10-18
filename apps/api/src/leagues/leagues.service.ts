import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { buildLeaguePeriod } from './league-period.js';
import { leagueStatusAt } from './league-status.js';
import type { LeagueStatus } from './league-status.js';
import { NotALeagueParticipantError } from './leagues.errors.js';
import { LeaguesRepository } from './leagues.repository.js';
import type { StoredLeague } from './leagues.repository.js';

/** Entrada da regra, já validada na borda. O criador vem do token, não do corpo. */
export type CreateLeagueInput = {
  name: string;
  /** Dia de início, `AAAA-MM-DD`, como a pessoa escolheu no formulário. */
  startDate: string;
  /** Dia de fim, `AAAA-MM-DD`. */
  endDate: string;
  /** Fuso de quem está criando, em minutos (ver league-period.ts). */
  timeZoneOffsetMinutes: number;
  creatorId: string;
};

/**
 * Liga como o domínio a entrega: o que está gravado mais a situação, que não é
 * coluna — é calculada a cada leitura a partir do período e do instante atual.
 */
export type LeagueWithStatus = StoredLeague & {
  status: LeagueStatus;
};

/**
 * Ordem em que as ligas aparecem na lista. A que está valendo vem primeiro,
 * porque é nela que a pessoa tem algo a fazer agora; a encerrada fica por
 * último, presente como histórico.
 */
const STATUS_ORDER: Record<LeagueStatus, number> = {
  running: 0,
  scheduled: 1,
  finished: 2,
};

/**
 * Pessoa que pode ser convidada para uma liga, do ponto de vista de quem está
 * olhando a lista: o nome para reconhecer e se já está dentro.
 *
 * Não tem e-mail — nem aqui nem na consulta que a origina (ver
 * users.repository.ts): e-mail de terceiro não sai da aplicação.
 */
export type LeagueCandidate = {
  id: string;
  name: string;
  /** `true` quando a pessoa já participa: a tela mostra isso no lugar do convite. */
  alreadyParticipant: boolean;
};

@Injectable()
export class LeaguesService {
  constructor(
    private readonly leagues: LeaguesRepository,
    // Ligas dependem de contas (precisam saber quem existe), nunca o contrário:
    // o módulo de contas não conhece liga nenhuma.
    private readonly users: UsersService,
  ) {}

  /**
   * Cria a liga com quem criou já dentro dela.
   *
   * Duas decisões ficam aqui porque são regra, não transporte nem banco: o
   * período é calculado pelo servidor a partir do dia escolhido (o cliente não
   * dita instante), e quem cria entra como participante — sem papel e sem
   * permissão, porque numa liga entre amigos não há o que autorizar.
   */
  async create(input: CreateLeagueInput): Promise<LeagueWithStatus> {
    // Um único "agora" para a regra do período e para a situação: com duas
    // chamadas a `new Date()` os dois poderiam cair em lados diferentes da
    // virada do dia. Este service é o lugar onde o tempo entra no sistema.
    const now = new Date();

    const period = buildLeaguePeriod(
      {
        startDate: input.startDate,
        endDate: input.endDate,
        timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
      },
      now,
    );

    const league = await this.leagues.create({
      name: input.name,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      creatorId: input.creatorId,
    });

    return { ...league, status: leagueStatusAt(league, now) };
  }

  /**
   * Ligas de que a pessoa participa, com a situação de cada uma, na ordem em
   * que a tela as mostra.
   *
   * A situação é calculada na leitura, não guardada: uma coluna de situação
   * ficaria errada sozinha na virada da meia-noite, e precisaria de um job só
   * para envelhecer bem.
   *
   * A ordenação é feita aqui, em memória, e não no SQL, porque depende da
   * situação — que o banco não conhece. Vale enquanto um participante tem
   * poucas ligas, que é o caso de uma liga entre amigos. Com paginação isso
   * muda: aí a ordem precisa ir para a consulta, e a situação com ela.
   */
  async listForParticipant(userId: string): Promise<LeagueWithStatus[]> {
    const leagues = await this.leagues.findByParticipant(userId);

    // O mesmo instante para todas: com um `new Date()` por liga, duas ligas com
    // o mesmo fim poderiam sair uma "em andamento" e outra "encerrada".
    const now = new Date();

    return leagues
      .map((league) => ({ ...league, status: leagueStatusAt(league, now) }))
      .sort(compareForListing);
  }

  /**
   * Quem pode ser convidado para a liga: todas as contas cadastradas, cada uma
   * marcada se já participa.
   *
   * Duas regras ficam aqui:
   *
   * 1. **Autorização.** Só participante da liga enxerga a lista. Quem não
   *    participa — e quem passa um id de liga que não existe — recebe o mesmo
   *    erro, então não há como descobrir ligas alheias testando ids.
   * 2. **Quem está pedindo sai da lista.** Ninguém se convida, e a pessoa já
   *    sabe que está dentro. Mantê-la ali só gastaria uma linha dizendo o óbvio.
   *
   * Quem já participa continua aparecendo, marcado: quem procura o amigo precisa
   * distinguir "ele já está na liga" de "ele não tem conta" — some a lista e as
   * duas situações viram a mesma tela vazia.
   */
  async listCandidates(
    leagueId: string,
    requesterId: string,
  ): Promise<LeagueCandidate[]> {
    const participantIds = await this.leagues.findParticipantUserIds(leagueId);

    // `Set` porque a marcação abaixo consulta esta coleção uma vez por conta
    // cadastrada: com `includes`, seriam participantes × contas comparações.
    const participants = new Set(participantIds);

    if (!participants.has(requesterId)) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    const users = await this.users.listPublic();

    return users
      .filter((user) => user.id !== requesterId)
      .map((user) => ({
        id: user.id,
        name: user.name,
        alreadyParticipant: participants.has(user.id),
      }));
  }
}

/** Situação primeiro; dentro do mesmo grupo, a de início mais recente antes. */
function compareForListing(
  a: LeagueWithStatus,
  b: LeagueWithStatus,
): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (byStatus !== 0) return byStatus;

  const byStart = b.startsAt.getTime() - a.startsAt.getTime();
  if (byStart !== 0) return byStart;

  // Desempate final para a ordem não ficar à mercê do que o banco devolveu
  // primeiro. O id é UUID v7, então o maior é o criado mais recentemente.
  return a.id < b.id ? 1 : -1;
}
