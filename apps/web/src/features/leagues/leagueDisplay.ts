import type { LeagueStatus } from './leaguesApi'

/**
 * Como a liga é **apresentada**: a palavra de cada situação e o formato do
 * período.
 *
 * Nasceu dentro do `LeagueCard`, e saiu para cá quando o bloco de convites
 * passou a precisar das duas coisas. É tradução e formatação, nunca regra:
 * qual é a situação quem decide é o backend, e nada aqui recalcula data.
 */

/**
 * Palavra de cada situação na tela. Trocar "Em andamento" por "Valendo agora"
 * não toca na API — o backend manda o código, não o rótulo.
 */
export const STATUS_LABEL: Record<LeagueStatus, string> = {
  running: 'Em andamento',
  scheduled: 'Agendada',
  finished: 'Encerrada',
}

/**
 * Período no formato de quem está lendo. A API manda ISO em UTC; aqui ele é
 * formatado no fuso do navegador, sem nenhum recálculo — o dia exibido é o
 * instante que o backend gravou.
 */
export function formatPeriod(startsAt: string, endsAt: string): string {
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })

  return `${format.format(new Date(startsAt))} até ${format.format(new Date(endsAt))}`
}
