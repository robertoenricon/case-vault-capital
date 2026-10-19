import { parseBinanceTickerPrice } from './binance-ticker-price.js';
import { QuotesUnavailableError } from './quotes.errors.js';

/**
 * Leitura do corpo da Binance. Como no `parseInitialBalance`, o que está sob
 * teste é a **recusa**: o caminho feliz ensina pouco, e cada corpo recusado
 * aqui é um jeito de um preço inventado entrar na plataforma.
 *
 * Nenhuma rede, nenhum mock de `fetch`: a função recebe o JSON já
 * desserializado, então o teste não depende de estar on-line.
 */

const SYMBOL = 'BTCUSDT';

describe('parseBinanceTickerPrice', () => {
  it('devolve o preço como texto, sem tocar nas casas decimais', () => {
    // Texto idêntico ao recebido, inclusive os zeros à direita: o valor segue
    // para conta de dinheiro, e normalizar aqui seria a primeira perda.
    expect(
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '121234.56000000' }, SYMBOL),
    ).toBe('121234.56000000');
  });

  it('aceita preço inteiro, sem parte decimal', () => {
    expect(parseBinanceTickerPrice({ symbol: SYMBOL, price: '120000' }, SYMBOL)).toBe(
      '120000',
    );
  });

  it('recusa a resposta de outro par', () => {
    // O caso mais perigoso: corpo bem formado, preço válido, ativo errado.
    // Sem esta conferência, o preço do ethereum viraria preço do bitcoin.
    expect(() =>
      parseBinanceTickerPrice({ symbol: 'ETHUSDT', price: '4200.00' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('recusa corpo que não é objeto', () => {
    expect(() => parseBinanceTickerPrice('fora do ar', SYMBOL)).toThrow(
      QuotesUnavailableError,
    );
    expect(() => parseBinanceTickerPrice(null, SYMBOL)).toThrow(
      QuotesUnavailableError,
    );
  });

  it('recusa corpo sem o campo de preço', () => {
    // É a forma do erro da Binance: `{ code, msg }`, com status 200 em alguns
    // casos. Sem esta checagem, viraria `undefined` adiante.
    expect(() =>
      parseBinanceTickerPrice({ code: -1121, msg: 'Invalid symbol.' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('recusa preço que veio como número', () => {
    // Não é só tipo: um JSON com 121234.56000000 numérico já chegaria como
    // float binário, e a precisão se perderia antes de qualquer validação.
    expect(() =>
      parseBinanceTickerPrice({ symbol: SYMBOL, price: 121234.56 }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('recusa notação exponencial e vírgula decimal', () => {
    expect(() =>
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '1.2e5' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);

    expect(() =>
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '121234,56' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('recusa preço negativo', () => {
    expect(() =>
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '-100.00' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('recusa preço zero', () => {
    // Decimal válido, impossível de verdade — e o bastante para alguém comprar
    // bitcoin de graça quando a ordem existir.
    expect(() =>
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '0.00000000' }, SYMBOL),
    ).toThrow(QuotesUnavailableError);
  });

  it('não vaza o detalhe técnico na mensagem pública', () => {
    // O detalhe serve ao log. O que chega ao cliente é sempre a mesma frase,
    // sem nome de fornecedor nem formato de resposta de terceiro.
    try {
      parseBinanceTickerPrice({ symbol: SYMBOL, price: '0' }, SYMBOL);
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(QuotesUnavailableError);
      expect((error as QuotesUnavailableError).publicMessage).not.toContain(
        'Binance',
      );
    }
  });
});
