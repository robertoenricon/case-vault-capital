/**
 * Situação da liga em relação a um instante.
 *
 * É regra de negócio, e por isso mora no backend: o front recebe a situação
 * pronta e só decide a palavra que aparece na tela. Se cada cliente comparasse
 * as datas por conta própria, a liga poderia estar "em andamento" no celular e
 * "encerrada" no navegador, dependendo do relógio de cada aparelho.
 *
 * Função pura, com o "agora" por parâmetro: dá para testar as bordas sem
 * depender da hora em que o teste roda.
 */

export type LeagueStatus = 'scheduled' | 'running' | 'finished';

/** O que basta saber de uma liga para decidir a situação dela. */
type LeaguePeriodLike = {
  startsAt: Date;
  endsAt: Date;
};

export function leagueStatusAt(
  period: LeaguePeriodLike,
  now: Date,
): LeagueStatus {
  const instant = now.getTime();

  if (instant < period.startsAt.getTime()) {
    return 'scheduled';
  }

  // As duas pontas são inclusivas: `endsAt` é o último instante do dia de fim
  // (23:59:59.999), então a liga vale até ele, não até antes dele.
  if (instant > period.endsAt.getTime()) {
    return 'finished';
  }

  return 'running';
}
