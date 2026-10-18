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

/**
 * Formatador do saldo: dólar, com duas casas e separador de milhar em português
 * — "US$ 10.000,00". Criado uma vez, fora da função: montar um `Intl` por
 * chamada custaria caro numa lista de ligas que renderiza a cada atualização.
 */
const USD = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Saldo em dólar, como a tela o mostra. Recebe o texto decimal que a API manda
 * (`"10000"`, `"7500.25"`).
 *
 * O `Number` aqui é **só para formatar**, e este é o único lugar do front onde
 * o saldo vira número: o valor que atravessa estado, props e tipos continua
 * sendo o texto exato da API. Dinheiro em ponto flutuante perde centavo em
 * conta — e o front não faz conta nenhuma com saldo, porque quem calcula é o
 * backend. A alternativa (`Intl` aceita texto decimal direto) exigiria um
 * `as` para calar o TypeScript, que pede um tipo literal; o engano de arredondar
 * na vigésima casa decimal de um número exibido com duas é menor do que o de
 * desligar o compilador.
 */
export function formatUsd(amount: string): string {
  const value = Number(amount)

  // Resposta fora do formato esperado não deve virar "US$ NaN" na tela. O texto
  // cru é menos bonito e mais honesto: mostra que o valor chegou, mas estranho.
  if (!Number.isFinite(value)) return amount

  return USD.format(value)
}
