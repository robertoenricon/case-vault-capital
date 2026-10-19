/**
 * Como o retorno de um participante é exibido.
 *
 * Mora aqui, e não em `lib/money.ts`, porque o ranking é hoje o único lugar
 * que mostra percentual — é o mesmo caminho que o `formatUsd` fez: nasceu
 * dentro da feature que precisava dele e só subiu para `lib/` quando apareceu
 * o segundo consumidor. Promover antes da hora é inventar utilitário comum
 * para um uso só.
 */

/**
 * Formatador do percentual: sempre duas casas e **sinal explícito no
 * positivo** — "+4,30%", "-1,23%", "0,00%".
 *
 * O sinal importa numa disputa: sem ele, "4,30%" e "-4,30%" só se distinguem
 * por um traço fácil de perder de vista numa lista. `exceptZero` deixa o zero
 * sem sinal, porque "+0,00%" sugeriria um ganho que não houve.
 *
 * Criado uma vez, fora da função: montar um `Intl` por chamada custaria caro
 * numa lista que renderiza a cada ordem executada.
 */
const PERCENT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/**
 * Retorno em pontos percentuais, como a tela o mostra. Recebe o texto decimal
 * que a API manda (`"4.3"`, `"-1.23"`, `"0"`).
 *
 * Mesma ressalva do `formatUsd`: o `Number` aqui é **só para formatar**. O
 * front não calcula percentual nenhum — quem dividiu pelo saldo inicial foi o
 * backend, com aritmética decimal.
 *
 * O `%` é concatenado em vez de usar `style: 'percent'` do `Intl`, que
 * multiplicaria o valor por 100: a API já manda em pontos percentuais, e
 * "4.3" viraria "430%".
 */
export function formatPercent(value: string): string {
  const parsed = Number(value)

  // Resposta fora do formato esperado não deve virar "NaN%" na tela. O texto
  // cru é menos bonito e mais honesto.
  if (!Number.isFinite(parsed)) return value

  return `${PERCENT.format(parsed)}%`
}
