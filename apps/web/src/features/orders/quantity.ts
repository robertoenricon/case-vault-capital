/**
 * Quantidade de cripto digitada na tela: o que conta como válido e quanto
 * aquilo custaria.
 *
 * Fica separada do componente porque é regra sem React: dá para ler de cima a
 * baixo e entender o que a tela aceita, sem abrir JSX nenhum.
 */

/**
 * Até 12 dígitos inteiros e 8 decimais, com ponto — o mesmo formato do saldo
 * inicial e do preço vindo da Binance, porque é o que a coluna `numeric(20, 8)`
 * guarda sem arredondar.
 *
 * Sem sinal e sem notação exponencial: `<input type="number">` aceita os dois
 * ("-1", "1e5" são valores válidos para o HTML), e nenhum dos dois é uma
 * quantidade de bitcoin que alguém quis digitar.
 */
const QUANTITY_FORMAT = /^\d{1,12}(\.\d{1,8})?$/

/** Zero escrito de qualquer forma: `0`, `0.0`, `0.00000000`. */
const ZERO = /^0+(\.0+)?$/

/**
 * Resultado da leitura do campo. Três estados, não dois: "vazio" não é erro —
 * é o campo antes de alguém digitar, e mostrar mensagem vermelha num formulário
 * recém-aberto é hostil.
 */
export type ParsedQuantity =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; value: string }

/**
 * Lê o que está no campo.
 *
 * Recebe e devolve **texto**: a quantidade é o valor que vai no payload da
 * ordem, e o backend a espera como decimal exato. Ela não vira `number` em
 * nenhum ponto do caminho.
 */
export function parseQuantity(raw: string): ParsedQuantity {
  const value = raw.trim()

  if (!value) return { kind: 'empty' }

  if (!QUANTITY_FORMAT.test(value)) {
    return {
      kind: 'invalid',
      message: 'Use um número positivo com até 8 casas decimais.',
    }
  }

  if (ZERO.test(value)) {
    return { kind: 'invalid', message: 'Informe uma quantidade maior que zero.' }
  }

  return { kind: 'valid', value }
}

/**
 * Quanto custariam essas unidades, **só para mostrar na tela**.
 *
 * ⚠️ Aqui, e só aqui, dinheiro passa por ponto flutuante — decisão consciente,
 * tomada sabendo que contraria a regra do projeto de nunca usar `number` em
 * valor monetário. O que a torna aceitável é o limite: este número **não sai
 * da tela**. O payload da compra leva a quantidade em texto, e quem calcula o
 * total que será cobrado é o backend, com o preço que ele mesmo buscou.
 *
 * O erro é real, não teórico: `0.1 * 82115.12` dá `8211.511999999999` em
 * float. O `toFixed(2)` esconde isso no centavo exibido, e em quantidades
 * grandes o desvio pode aparecer na última casa.
 *
 * Quando a ordem de verdade existir, **este é o único ponto a trocar** por
 * aritmética decimal — e nenhum valor gravado terá passado por aqui.
 *
 * @param quantity texto decimal já validado por `parseQuantity`.
 * @param price texto decimal, como a API de cotação devolve.
 */
export function previewTotalUsd(quantity: string, price: string): string {
  return (Number(quantity) * Number(price)).toFixed(2)
}

/**
 * O total estimado passou do saldo disponível?
 *
 * Decisão de produto: isso **avisa, não bloqueia**. A validação que vale é a do
 * backend, na hora de executar a ordem; a tela espelha a regra para a pessoa
 * não descobrir o problema só no clique final, e nunca a substitui.
 *
 * Mesma ressalva de float do `previewTotalUsd`: é comparação para pintar um
 * aviso, não para autorizar nada.
 */
export function isAboveBalance(totalUsd: string, balanceUsd: string): boolean {
  return Number(totalUsd) > Number(balanceUsd)
}

/**
 * A quantidade digitada passa do que a pessoa tem em carteira?
 *
 * O espelho de `isAboveBalance` na venda, com a mesma postura: **avisa, não
 * bloqueia**. Quem recusa de verdade é o backend, que compara em decimal exato
 * contra a carteira no instante da execução — a desta tela pode ter mudado
 * desde que a lista foi carregada.
 *
 * Mesma ressalva de float das funções acima, e ela é mais branda aqui: os dois
 * lados são textos decimais de até 8 casas lidos direto da API, sem nenhuma
 * multiplicação no meio. O desvio precisaria de mais dígitos significativos do
 * que uma quantidade de bitcoin tem para mudar a comparação.
 *
 * @param quantity texto decimal já validado por `parseQuantity`.
 * @param position quantidade em carteira, texto decimal vindo da API.
 */
export function isAbovePosition(quantity: string, position: string): boolean {
  return Number(quantity) > Number(position)
}
