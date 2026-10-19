/**
 * Os dois lados de uma ordem.
 *
 * Arquivo próprio, e não um literal solto em cada lugar, porque três camadas
 * precisam da mesma palavra: o DTO recusa qualquer outra, o service decide o
 * que fazer com cada uma e a coluna `side` da tabela guarda exatamente estes
 * dois valores.
 *
 * O tipo é declarado aqui e **não** importado do client do Prisma de
 * propósito: a regra de negócio não deve conhecer o enum do ORM. O preço é
 * manter os dois alinhados à mão — barato, já que são duas palavras que não
 * mudam, e o compilador reclama na gravação se divergirem.
 */

/** Ordem de compra ou de venda. Não existe terceiro lado. */
export type OrderSide = 'buy' | 'sell';

/**
 * Os valores aceitos, para a validação da borda.
 *
 * `as const satisfies` em vez de só `as const`: o `satisfies` faz o compilador
 * conferir que a lista e o tipo acima continuam combinando. Acrescentar um
 * lado no tipo sem acrescentá-lo aqui vira erro de compilação, não um valor
 * que a API recusa em silêncio.
 */
export const ORDER_SIDES = ['buy', 'sell'] as const satisfies readonly OrderSide[];
