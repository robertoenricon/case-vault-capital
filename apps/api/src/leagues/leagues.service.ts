import { Injectable } from '@nestjs/common';
import { buildLeaguePeriod } from './league-period.js';
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

@Injectable()
export class LeaguesService {
  constructor(private readonly leagues: LeaguesRepository) {}

  /**
   * Cria a liga com quem criou já dentro dela.
   *
   * Duas decisões ficam aqui porque são regra, não transporte nem banco: o
   * período é calculado pelo servidor a partir do dia escolhido (o cliente não
   * dita instante), e quem cria entra como participante — sem papel e sem
   * permissão, porque numa liga entre amigos não há o que autorizar.
   */
  async create(input: CreateLeagueInput): Promise<StoredLeague> {
    // `new Date()` aqui, e não dentro da regra: a regra recebe o instante e por
    // isso é testável na virada do dia. Este service é o lugar onde "agora"
    // entra no sistema.
    const period = buildLeaguePeriod(
      {
        startDate: input.startDate,
        endDate: input.endDate,
        timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
      },
      new Date(),
    );

    return this.leagues.create({
      name: input.name,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      creatorId: input.creatorId,
    });
  }
}
