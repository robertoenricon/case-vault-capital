/**
 * Contrato de consulta de cotação.
 *
 * É a abstração de que a regra de negócio vai depender quando a compra e a
 * venda existirem: o serviço de ordens pedirá o preço a esta interface, não à
 * Binance. Trocar de fonte (CoinGecko, um provider com cache, um fake de
 * teste) passa a ser trocar o registro no módulo — o código que executa a
 * ordem não muda uma linha.
 *
 * Mora aqui, no módulo que consome, e não junto do cliente HTTP: se a
 * interface vivesse ao lado do adaptador da Binance, a seta continuaria
 * apontando para fora e a inversão seria só decoração.
 */

/** Preço de um ativo num instante. */
export type Quote = {
  /** Código do ativo como o produto o chama: `BTC`. */
  symbol: string;
  /**
   * Preço em dólar, **texto decimal** exatamente como veio da fonte.
   *
   * Nunca `number`: este valor vai alimentar o cálculo de uma ordem, e passar
   * por ponto flutuante binário aqui já perderia precisão antes de qualquer
   * conta. Quem formata para a tela é o front.
   */
  price: string;
  /**
   * Instante em que a cotação foi lida da fonte.
   *
   * Existe porque hoje a tela busca o preço uma vez e não atualiza sozinha: o
   * número que a pessoa olha é uma foto, e ela precisa saber de quando é.
   */
  asOf: Date;
};

export interface QuotesProvider {
  /**
   * Preço atual do bitcoin em dólar.
   *
   * Um método para um ativo, e não `priceOf(symbol)`, porque **a variação
   * ainda não existe**: bitcoin é a única cripto negociável hoje, e qual será
   * o catálogo é decisão de produto ainda em aberto. Um parâmetro de símbolo
   * agora seria ponto de extensão especulativo — dívida com cara de
   * arquitetura. Quando o catálogo for decidido, esta assinatura muda junto
   * com ele, e o compilador aponta todos os pontos a ajustar.
   *
   * @throws {QuotesUnavailableError} quando a fonte não responde, demora
   * demais ou devolve algo que não dá para usar como preço.
   */
  bitcoinPrice(): Promise<Quote>;
}

/** Token de injeção: interface não existe em runtime, então o Nest precisa de um símbolo. */
export const QUOTES_PROVIDER = Symbol('QuotesProvider');
