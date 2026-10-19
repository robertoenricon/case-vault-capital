import { QuotesUnavailableError } from './quotes.errors.js';

/**
 * Leitura do corpo de `GET /api/v3/ticker/price` da Binance.
 *
 * Fica separada do adaptador HTTP por um motivo: é a única parte com regra de
 * verdade — decidir o que conta como preço utilizável — e é regra sem
 * dependência nenhuma (sem Nest, sem rede), por isso testável direto (ver
 * binance-ticker-price.spec.ts). O que sobra no adaptador é encanamento.
 *
 * A postura aqui é de desconfiança deliberada. A resposta vem de um sistema
 * que não controlamos, e esse número vai virar o preço de uma ordem: aceitar
 * um corpo estranho seria deixar a Binance decidir quanto vale o bitcoin
 * dentro da nossa liga.
 */

/**
 * Até 12 dígitos inteiros e 8 decimais, com ponto — o mesmo formato aceito no
 * saldo inicial (ver leagues/initial-balance.ts), porque é o que a coluna
 * `numeric(20, 8)` guarda sem arredondar.
 *
 * Sem sinal (preço negativo não existe), sem notação exponencial e sem
 * vírgula: qualquer uma das três viraria outro número ao ser lida adiante.
 */
const DECIMAL_FORMAT = /^\d{1,12}(\.\d{1,8})?$/;

/** Zero escrito de qualquer forma: `0`, `0.0`, `0.00000000`. */
const ZERO = /^0+(\.0+)?$/;

/**
 * Extrai o preço do corpo, ou recusa a resposta inteira.
 *
 * @param payload o JSON já desserializado, tipado como `unknown` porque é
 * exatamente o que ele é: nada garante a forma antes de conferir.
 * @param expectedSymbol o par que foi pedido (`BTCUSDT`). Conferir que a
 * resposta é **daquele** par evita o pior caso silencioso — a Binance
 * respondendo outro ativo e nós gravando o preço do ethereum como bitcoin.
 *
 * @throws {QuotesUnavailableError} em qualquer desvio da forma esperada.
 */
export function parseBinanceTickerPrice(
  payload: unknown,
  expectedSymbol: string,
): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new QuotesUnavailableError('a Binance respondeu algo que não é objeto');
  }

  if (
    !('symbol' in payload) ||
    typeof payload.symbol !== 'string' ||
    payload.symbol !== expectedSymbol
  ) {
    throw new QuotesUnavailableError(
      `a Binance respondeu um par diferente do pedido (${expectedSymbol})`,
    );
  }

  if (!('price' in payload) || typeof payload.price !== 'string') {
    throw new QuotesUnavailableError(
      'a resposta da Binance não traz o preço como texto',
    );
  }

  const price = payload.price;

  if (!DECIMAL_FORMAT.test(price)) {
    throw new QuotesUnavailableError(
      `preço fora do formato decimal esperado: "${price}"`,
    );
  }

  // Preço zero é tecnicamente um decimal válido e economicamente impossível.
  // Recusar aqui é o que impede um dia alguém comprar bitcoin de graça por
  // conta de uma resposta defeituosa.
  if (ZERO.test(price)) {
    throw new QuotesUnavailableError('a Binance respondeu preço zero');
  }

  return price;
}
