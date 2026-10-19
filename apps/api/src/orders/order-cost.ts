import { Prisma } from '../generated/prisma/client.js';

/**
 * Quanto custa uma ordem: `quantidade × preço`, com a regra de arredondamento
 * decidida.
 *
 * Mora em arquivo próprio, fora do service, porque é a conta mais delicada do
 * produto e dá para testá-la sem Nest, sem banco e sem rede.
 *
 * Sobre o import do Prisma num arquivo de regra: `Prisma.Decimal` **é** o
 * decimal.js, reexportado pelo client gerado — biblioteca de aritmética, não
 * tipo de ORM. O decimal.js não existe como pacote separado no `node_modules`
 * (vem embutido no runtime do Prisma), então usá-lo por aqui é a alternativa a
 * adicionar uma dependência que, na prática, já está instalada. O preço
 * assumido é um import de infraestrutura num arquivo de domínio; o ganho é não
 * escrever aritmética decimal à mão num produto que lida com dinheiro.
 */

/**
 * Escala das colunas de dinheiro e quantidade: `numeric(20, 8)`.
 *
 * Oito casas porque é a menor fração de bitcoin que existe (1 satoshi). O
 * resultado da multiplicação precisa caber aqui antes de chegar ao banco — se
 * chegasse com mais casas, o Postgres arredondaria por conta própria, com uma
 * regra que ninguém decidiu.
 */
const DECIMAL_PLACES = 8;

/**
 * Aritmética com 50 dígitos significativos, em vez dos 20 que o decimal.js usa
 * por padrão.
 *
 * O padrão não basta: `123.45678901 × 82115.12345678` tem 24 dígitos
 * significativos, e com precisão 20 o produto já sairia arredondado **antes**
 * de chegar ao truncamento. Com 50, a multiplicação de dois valores de
 * `numeric(20, 8)` é sempre exata, e o único arredondamento do caminho é o que
 * está decidido abaixo.
 *
 * `clone` e não `Decimal.set`: configurar o decimal.js global mudaria o
 * comportamento de toda leitura de `numeric` que o Prisma faz na aplicação.
 */
const Money = Prisma.Decimal.clone({ precision: 50 });

/**
 * Custo total da ordem, em texto decimal.
 *
 * **Trunca** na oitava casa — decisão de produto registrada. Não é
 * arredondamento aritmético: o que passa da oitava casa é descartado,
 * independentemente do que venha depois. `0.12345678 × 82115.12` dá
 * `10137.6683045136` e vira `10137.66830451`.
 *
 * Truncar é a regra mais simples de explicar e, na compra, sempre cobra de
 * menos — nunca a mais. Vale registrar para quando a venda existir: truncar o
 * valor recebido numa venda cai para o outro lado, creditando de menos. O viés
 * não é "a favor de quem opera", é "a favor do número menor".
 *
 * Texto na entrada e na saída, nunca `number`: é o mesmo valor que vai debitar
 * o saldo e ser gravado na ordem, e um `toNumber()` no meio do caminho jogaria
 * dinheiro num ponto flutuante binário.
 *
 * @param quantity quantidade negociada, texto decimal já validado.
 * @param unitPrice preço unitário obtido pelo backend, texto decimal.
 */
export function orderCost(quantity: string, unitPrice: string): string {
  return new Money(quantity)
    .times(unitPrice)
    .toDecimalPlaces(DECIMAL_PLACES, Prisma.Decimal.ROUND_DOWN)
    .toFixed();
}

/**
 * A quantidade é maior que zero?
 *
 * O DTO já recusou sinal negativo e formato estranho; o que sobra para o
 * domínio decidir é se `0` (ou `0.00000000`) conta como ordem — e não conta.
 *
 * Comparação decimal, não `Number(value) > 0`: é o mesmo princípio do resto do
 * arquivo, e evita que `"0.000000000000001"` (que o DTO recusa, mas que um
 * outro chamador poderia passar) vire `0` por arredondamento de float.
 */
export function isPositiveAmount(value: string): boolean {
  return new Money(value).gt(0);
}

/**
 * O saldo cobre esse custo?
 *
 * Comparação decimal exata, nunca `Number(a) >= Number(b)`: é ela que autoriza
 * gastar dinheiro, e é o último lugar do sistema onde um erro de ponto
 * flutuante poderia deixar passar uma compra sem saldo.
 *
 * Esta é a verificação **amigável**, feita para a pessoa receber uma mensagem
 * clara. Quem de fato impede o saldo negativo é a escrita condicional no banco
 * (ver orders.repository.ts) — entre esta conferência e o commit, outra ordem
 * da mesma pessoa pode ter gasto o dinheiro.
 */
export function balanceCovers(balance: string, cost: string): boolean {
  return new Money(balance).gte(cost);
}
