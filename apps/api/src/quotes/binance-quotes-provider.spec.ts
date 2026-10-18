import { BinanceQuotesProvider } from './binance-quotes-provider.js';
import { QuotesUnavailableError } from './quotes.errors.js';

/**
 * Encanamento HTTP do adaptador da Binance.
 *
 * O que está sob teste aqui é **só uma coisa**: nenhuma falha de transporte
 * escapa crua. Um `TypeError: fetch failed` subindo daqui viraria 500 no
 * filtro padrão do Nest — dizendo ao cliente que a nossa aplicação quebrou
 * quando quem caiu foi a Binance.
 *
 * O `fetch` global é trocado por um dublê: nenhum teste do projeto pode
 * depender de estar on-line, nem de a Binance estar de pé. A leitura do corpo
 * é testada à parte, sem dublê nenhum (ver binance-ticker-price.spec.ts).
 */

/** Resposta de sucesso da Binance, como ela realmente vem. */
function tickerResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('BinanceQuotesProvider', () => {
  const provider = new BinanceQuotesProvider();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve o preço e o instante da leitura', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        tickerResponse({ symbol: 'BTCUSDT', price: '81913.36000000' }),
      ),
    );

    const antes = Date.now();
    const quote = await provider.bitcoinPrice();

    // `BTC`, não `BTCUSDT`: o par é vocabulário da corretora e não vaza daqui.
    expect(quote.symbol).toBe('BTC');
    expect(quote.price).toBe('81913.36000000');
    expect(quote.asOf.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('transforma queda de rede em erro de domínio', async () => {
    // É o que o `fetch` do Node lança com DNS fora, conexão recusada ou cabo
    // na tomada. Sem o tratamento, viraria 500.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    await expect(provider.bitcoinPrice()).rejects.toBeInstanceOf(
      QuotesUnavailableError,
    );
  });

  it('transforma timeout em erro de domínio', async () => {
    // O `AbortSignal.timeout` rejeita com esta exceção quando estoura.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')),
    );

    await expect(provider.bitcoinPrice()).rejects.toBeInstanceOf(
      QuotesUnavailableError,
    );
  });

  it('trata rate limit da Binance como indisponibilidade', async () => {
    // 429 é o caso que mais tende a acontecer de verdade: sem cache, cada
    // abertura de modal é uma chamada. Para quem está na tela, é "tente de
    // novo" — não um erro que ele possa corrigir.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 429 })),
    );

    await expect(provider.bitcoinPrice()).rejects.toBeInstanceOf(
      QuotesUnavailableError,
    );
  });

  it('trata erro interno da Binance como indisponibilidade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    );

    await expect(provider.bitcoinPrice()).rejects.toBeInstanceOf(
      QuotesUnavailableError,
    );
  });

  it('trata corpo que não é JSON como indisponibilidade', async () => {
    // Acontece quando um proxy ou uma página de erro responde no lugar da API.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 200 })),
    );

    await expect(provider.bitcoinPrice()).rejects.toBeInstanceOf(
      QuotesUnavailableError,
    );
  });

  it('não entrega detalhe técnico ao cliente em nenhum desses casos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 429 })),
    );

    await expect(provider.bitcoinPrice()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof QuotesUnavailableError &&
        // O status e o nome do fornecedor ficam no `message`, que é log...
        error.message.includes('429') &&
        // ...e não no que o filtro devolve na resposta HTTP.
        !error.publicMessage.includes('429') &&
        !error.publicMessage.includes('Binance'),
    );
  });
});
