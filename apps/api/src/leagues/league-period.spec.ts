import { buildLeaguePeriod } from './league-period.js';
import {
  LeagueEndsBeforeStartError,
  LeagueStartsInPastError,
  MalformedLeagueDateError,
} from './leagues.errors.js';

/**
 * Regra do período da liga, testada sem banco, sem servidor e sem Nest: é uma
 * função pura, e o "agora" entra por parâmetro.
 *
 * O fuso usado nos testes é o de São Paulo (UTC-3), que o navegador reporta
 * como 180 minutos. UTC entra em alguns casos para provar que a conta não
 * depende do fuso do servidor.
 */

const SAO_PAULO = 180;
const UTC = 0;

describe('buildLeaguePeriod — instantes do período', () => {
  it('começa 00:00 e termina 23:59:59.999 do dia escolhido, no fuso de quem cria', () => {
    const period = buildLeaguePeriod(
      {
        startDate: '2026-10-20',
        endDate: '2026-10-25',
        timeZoneOffsetMinutes: SAO_PAULO,
      },
      new Date('2026-10-18T15:00:00Z'),
    );

    // 00:00 em São Paulo é 03:00 UTC, e é assim que vai para o `timestamptz`.
    expect(period.startsAt.toISOString()).toBe('2026-10-20T03:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-10-26T02:59:59.999Z');
  });

  it('aceita liga de um dia: começa e termina no mesmo dia', () => {
    const period = buildLeaguePeriod(
      {
        startDate: '2026-10-20',
        endDate: '2026-10-20',
        timeZoneOffsetMinutes: SAO_PAULO,
      },
      new Date('2026-10-18T15:00:00Z'),
    );

    expect(period.startsAt.toISOString()).toBe('2026-10-20T03:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-10-21T02:59:59.999Z');
  });

  it('usa o fuso informado, não o do servidor', () => {
    const emUtc = buildLeaguePeriod(
      {
        startDate: '2026-10-20',
        endDate: '2026-10-20',
        timeZoneOffsetMinutes: UTC,
      },
      new Date('2026-10-18T15:00:00Z'),
    );

    expect(emUtc.startsAt.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });
});

describe('buildLeaguePeriod — início no passado', () => {
  it('aceita liga que começa hoje', () => {
    const period = buildLeaguePeriod(
      {
        startDate: '2026-10-18',
        endDate: '2026-10-20',
        timeZoneOffsetMinutes: SAO_PAULO,
      },
      // Meio-dia em São Paulo: 00:00 de hoje já passou, e ainda assim a liga
      // vale — a regra é sobre o dia, não sobre o instante.
      new Date('2026-10-18T15:00:00Z'),
    );

    expect(period.startsAt.toISOString()).toBe('2026-10-18T03:00:00.000Z');
  });

  it('recusa liga que começa ontem', () => {
    expect(() =>
      buildLeaguePeriod(
        {
          startDate: '2026-10-17',
          endDate: '2026-10-20',
          timeZoneOffsetMinutes: SAO_PAULO,
        },
        new Date('2026-10-18T15:00:00Z'),
      ),
    ).toThrow(LeagueStartsInPastError);
  });

  it('decide "hoje" pelo fuso de quem cria, não pelo do servidor', () => {
    // 01:00 UTC do dia 19 é 22:00 do dia 18 em São Paulo. Para quem está
    // criando, o dia 18 ainda é hoje — se a regra olhasse o relógio em UTC,
    // esta liga seria recusada como passado.
    const period = buildLeaguePeriod(
      {
        startDate: '2026-10-18',
        endDate: '2026-10-18',
        timeZoneOffsetMinutes: SAO_PAULO,
      },
      new Date('2026-10-19T01:00:00Z'),
    );

    expect(period.startsAt.toISOString()).toBe('2026-10-18T03:00:00.000Z');
  });
});

describe('buildLeaguePeriod — período invertido', () => {
  it('recusa fim antes do início', () => {
    expect(() =>
      buildLeaguePeriod(
        {
          startDate: '2026-10-25',
          endDate: '2026-10-20',
          timeZoneOffsetMinutes: SAO_PAULO,
        },
        new Date('2026-10-18T15:00:00Z'),
      ),
    ).toThrow(LeagueEndsBeforeStartError);
  });
});

describe('buildLeaguePeriod — datas que não existem', () => {
  it('recusa dia inexistente no calendário', () => {
    expect(() =>
      buildLeaguePeriod(
        {
          // Casa com AAAA-MM-DD e o `Date` normalizaria silenciosamente para
          // 03/03 — é exatamente o que a regra tem que barrar.
          startDate: '2026-02-31',
          endDate: '2026-03-10',
          timeZoneOffsetMinutes: SAO_PAULO,
        },
        new Date('2026-10-18T15:00:00Z'),
      ),
    ).toThrow(MalformedLeagueDateError);
  });

  it('recusa data fora do formato AAAA-MM-DD', () => {
    expect(() =>
      buildLeaguePeriod(
        {
          startDate: '20/10/2026',
          endDate: '2026-10-25',
          timeZoneOffsetMinutes: SAO_PAULO,
        },
        new Date('2026-10-18T15:00:00Z'),
      ),
    ).toThrow(MalformedLeagueDateError);
  });
});
