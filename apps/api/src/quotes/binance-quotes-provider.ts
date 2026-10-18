import { Injectable } from '@nestjs/common';
import { parseBinanceTickerPrice } from './binance-ticker-price.js';
import { QuotesUnavailableError } from './quotes.errors.js';
import type { Quote, QuotesProvider } from './quotes-provider.js';

/**
 * Implementação concreta na borda: o único arquivo do projeto que sabe que a
 * fonte de preço é a Binance. Nada além dele importa esta URL ou este formato.
 *
 * Usa o `fetch` global do Node, sem lib de HTTP: é uma requisição GET sem
 * autenticação: axios ou @nestjs/axios seriam dependência nova para não
 * resolver problema nenhum.
 */

/**
 * Par consultado. `BTCUSDT` é bitcoin cotado em **USDT**, a stablecoin de
 * dólar — a Binance não tem par em dólar de banco.
 *
 * Premissa assumida: 1 USDT = 1 US$. A moeda da liga é dólar, e a diferença
 * entre os dois costuma ficar abaixo de um décimo de por cento. Tratar o
 * desvio exigiria uma segunda cotação (USDT/USD) para corrigir casas decimais
 * que ninguém vê numa liga de brincadeira.
 */
const BINANCE_SYMBOL = 'BTCUSDT';

/** Como o produto chama o ativo. É o que sai na API, não o par da corretora. */
const BITCOIN = 'BTC';

const TICKER_PRICE_URL = `https://api.binance.com/api/v3/ticker/price?symbol=${BINANCE_SYMBOL}`;

/**
 * Teto de espera pela Binance.
 *
 * Cinco segundos porque esta chamada acontece **dentro** de uma requisição que
 * alguém está esperando na tela: sem teto, o `fetch` do Node esperaria o
 * timeout do sistema operacional e o modal ficaria carregando por minutos. É
 * tempo de infraestrutura, não regra de negócio — mudar daqui não muda nenhuma
 * regra da liga.
 */
const TIMEOUT_MS = 5_000;

@Injectable()
export class BinanceQuotesProvider implements QuotesProvider {
  async bitcoinPrice(): Promise<Quote> {
    const payload = await this.fetchTickerPrice();

    return {
      symbol: BITCOIN,
      price: parseBinanceTickerPrice(payload, BINANCE_SYMBOL),
      // Depois da resposta, não antes: o instante que interessa é o da leitura.
      asOf: new Date(),
    };
  }

  /**
   * Encanamento HTTP: busca o corpo e transforma **toda** falha de transporte
   * em `QuotesUnavailableError`. Nenhum erro de rede sobe daqui cru — um
   * `TypeError: fetch failed` viraria 500 no filtro padrão do Nest, dizendo ao
   * cliente que a nossa aplicação quebrou quando quem caiu foi a Binance.
   *
   * Não decide nada sobre o preço: isso é do `parseBinanceTickerPrice`.
   */
  private async fetchTickerPrice(): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(TICKER_PRICE_URL, {
        // Também cobre o caso de a Binance aceitar a conexão e nunca responder:
        // o sinal aborta a leitura do corpo, não só a abertura.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw new QuotesUnavailableError(
        `falha de rede ou timeout (${TIMEOUT_MS}ms) ao chamar a Binance`,
        { cause },
      );
    }

    if (!response.ok) {
      // Inclui o 429 de rate limit e o 418 de IP banido, que a Binance usa
      // quando o 429 é ignorado. Os dois são "tente mais tarde" para quem está
      // na tela; o status vai para o log, que é onde serve para alguma coisa.
      throw new QuotesUnavailableError(
        `a Binance respondeu HTTP ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new QuotesUnavailableError(
        'o corpo da resposta da Binance não é JSON',
        { cause },
      );
    }
  }
}
