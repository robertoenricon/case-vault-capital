import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { QUOTES_PROVIDER } from './quotes-provider.js';
import type { QuotesProvider } from './quotes-provider.js';

/** O que a API devolve sobre uma cotação. */
type QuoteResponse = {
  /** Código do ativo: `BTC`. */
  symbol: string;
  /**
   * Preço em dólar, como texto decimal (`"121234.56000000"`), nunca como
   * número do JSON — mesmo motivo do saldo da liga: `JSON.parse` devolveria um
   * float binário no navegador. Quem formata para "US$ 121.234,56" é o front.
   */
  price: string;
  /** ISO 8601 em UTC, como nas datas de liga. Quem formata é o front. */
  asOf: string;
};

/**
 * Cotações.
 *
 * **Sem service**, de propósito: hoje não existe regra nenhuma entre receber a
 * requisição e devolver o preço — qual ativo é fixo, e a validação do que a
 * fonte respondeu é responsabilidade do adaptador. Um service aqui só
 * repassaria a chamada, e camada que só repassa é dívida com cara de
 * arquitetura. Ele nasce quando houver o que decidir.
 *
 * O controller depende da **interface** `QuotesProvider`, não da Binance: é a
 * mesma porta que o serviço de ordens vai consumir quando a compra existir,
 * e ela já está invertida.
 *
 * Guard no controller, como em `leagues`: rota nova aqui nasce protegida. A
 * cotação é pública no mundo, mas a nossa rota não é — sem o guard, a API
 * viraria proxy aberto da Binance, gastando o nosso limite de requisições com
 * quem não tem conta.
 */
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(
    @Inject(QUOTES_PROVIDER) private readonly quotes: QuotesProvider,
  ) {}

  /**
   * Preço atual do bitcoin.
   *
   * Caminho fixo `btc` em vez de `:symbol` porque o catálogo de criptos
   * negociáveis ainda é decisão em aberto: um parâmetro agora prometeria ao
   * cliente uma flexibilidade que o backend não tem.
   *
   * Falha da fonte vira 503 pelo `QuotesUnavailableError`, não 500 — o
   * controller não conhece nenhum dos dois status.
   */
  @Get('btc')
  async bitcoin(): Promise<QuoteResponse> {
    const quote = await this.quotes.bitcoinPrice();

    // Campo a campo, como nas outras rotas: nada passa a sair na API sem
    // alguém decidir.
    return {
      symbol: quote.symbol,
      price: quote.price,
      asOf: quote.asOf.toISOString(),
    };
  }
}
