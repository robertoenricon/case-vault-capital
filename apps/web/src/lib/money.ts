/**
 * Como dinheiro é exibido no app.
 *
 * Nasceu dentro de `features/leagues/leagueDisplay.ts`, quando só o saldo da
 * liga precisava dele, e subiu para cá quando a cotação do bitcoin passou a
 * precisar do mesmo formato. As alternativas eram piores: duplicar a
 * configuração do `Intl` (dois lugares para mudar e um dia divergir) ou fazer
 * `features/quotes` importar de `features/leagues`, dependência ao contrário
 * entre duas features que não têm relação nenhuma.
 *
 * Aqui é formatação pura — nenhuma conta de dinheiro acontece no front.
 */

/**
 * Formatador do dólar: duas casas e separador de milhar em português —
 * "US$ 10.000,00". Criado uma vez, fora da função: montar um `Intl` por
 * chamada custaria caro numa lista que renderiza a cada atualização.
 */
const USD = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Valor em dólar, como a tela o mostra. Recebe o texto decimal que a API manda
 * (`"10000"`, `"7500.25"`, `"81913.36000000"`).
 *
 * O `Number` aqui é **só para formatar**, e este é o único lugar do front onde
 * dinheiro vira número: o valor que atravessa estado, props e tipos continua
 * sendo o texto exato da API. Dinheiro em ponto flutuante perde centavo em
 * conta — e o front não faz conta nenhuma, porque quem calcula é o backend. A
 * alternativa (`Intl` aceita texto decimal direto) exigiria um `as` para calar
 * o TypeScript, que pede um tipo literal; o engano de arredondar na vigésima
 * casa decimal de um número exibido com duas é menor do que o de desligar o
 * compilador.
 */
export function formatUsd(amount: string): string {
  const value = Number(amount)

  // Resposta fora do formato esperado não deve virar "US$ NaN" na tela. O texto
  // cru é menos bonito e mais honesto: mostra que o valor chegou, mas estranho.
  if (!Number.isFinite(value)) return amount

  return USD.format(value)
}

/**
 * Formatador de quantidade de cripto: até 8 casas (1 satoshi, a menor fração
 * de bitcoin), **sem zeros à direita**.
 *
 * O mínimo é zero casas de propósito: a API devolve `"0.06000000"`, e
 * "0,06000000 BTC" numa lista é ruído — a coluna fica larga e o número, difícil
 * de comparar de cima para baixo. Com o mínimo em zero, sai "0,06".
 */
const BTC = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
})

/**
 * Quantidade de bitcoin, como a tela a mostra. Recebe o texto decimal que a
 * API manda (`"0.06000000"`, `"0"`).
 *
 * Mesma ressalva do `formatUsd`: o `Number` aqui é **só para formatar**, e o
 * valor que atravessa estado, props e payload continua sendo o texto exato da
 * API. A tela não faz conta nenhuma com quantidade.
 */
export function formatBtc(quantity: string): string {
  const value = Number(quantity)

  if (!Number.isFinite(value)) return quantity

  return BTC.format(value)
}
