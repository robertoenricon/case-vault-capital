import { leagueStatusAt } from './league-status.js';

/**
 * Situação da liga, testada nas bordas: é onde a regra erra de verdade. O
 * "agora" entra por parâmetro, então o teste não depende da hora em que roda.
 */

const PERIODO = {
  startsAt: new Date('2026-10-20T03:00:00.000Z'),
  endsAt: new Date('2026-10-26T02:59:59.999Z'),
};

describe('leagueStatusAt', () => {
  it('é agendada antes de começar', () => {
    expect(leagueStatusAt(PERIODO, new Date('2026-10-19T12:00:00Z'))).toBe(
      'scheduled',
    );
  });

  it('é em andamento no meio do período', () => {
    expect(leagueStatusAt(PERIODO, new Date('2026-10-23T12:00:00Z'))).toBe(
      'running',
    );
  });

  it('é encerrada depois do fim', () => {
    expect(leagueStatusAt(PERIODO, new Date('2026-10-27T12:00:00Z'))).toBe(
      'finished',
    );
  });

  it('já está em andamento no instante exato do início', () => {
    // A borda inclusiva importa: um milissegundo de diferença aqui deixaria a
    // liga "agendada" para quem abrisse a tela exatamente na virada.
    expect(leagueStatusAt(PERIODO, PERIODO.startsAt)).toBe('running');
  });

  it('ainda está em andamento no último instante do fim', () => {
    // `endsAt` é 23:59:59.999 do dia de fim: o período vale até ele.
    expect(leagueStatusAt(PERIODO, PERIODO.endsAt)).toBe('running');
  });

  it('está encerrada um milissegundo depois do fim', () => {
    const umMsDepois = new Date(PERIODO.endsAt.getTime() + 1);

    expect(leagueStatusAt(PERIODO, umMsDepois)).toBe('finished');
  });
});
