import { Inject, Injectable } from '@nestjs/common';
import { BITCOIN } from '../common/assets.js';
import { leagueStatusAt } from '../leagues/league-status.js';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { QuotesProvider } from '../quotes/quotes-provider.js';
import { balanceCovers, isPositiveAmount, orderCost } from './order-cost.js';
import {
  InsufficientBalanceError,
  LeagueNotRunningError,
  NonPositiveOrderQuantityError,
  UnsupportedOrderSymbolError,
} from './orders.errors.js';
import { OrdersRepository } from './orders.repository.js';

/** Entrada da regra, já validada na borda. Quem opera vem do token. */
export type BuyInput = {
  leagueId: string;
  userId: string;
  symbol: string;
  /** Texto decimal, formato já conferido pelo DTO. */
  quantity: string;
};

/**
 * Ordem executada, como o domínio a entrega.
 *
 * Devolve o preço e o custo **realmente aplicados**, não os que a tela
 * estimou: o preço é buscado no momento da execução e pode ter se movido desde
 * que a pessoa olhou a cotação. Sem estes campos na resposta, a tela não teria
 * como contar o que de fato aconteceu.
 */
export type ExecutedOrder = {
  id: string;
  symbol: string;
  quantity: string;
  unitPrice: string;
  totalCost: string;
  executedAt: Date;
  /** Saldo depois da compra, para a tela atualizar sem nova requisição. */
  cashBalance: string;
  /** Quantidade total do ativo em carteira depois da compra. */
  positionQuantity: string;
};

/**
 * Único ativo negociável hoje.
 *
 * O código vem de `common/assets`, compartilhado com quem cota o preço e com
 * quem lê a posição: com a palavra em um lugar só, não há como um módulo
 * gravar `BTC` e outro consultar `btc`. O **que é negociável** continua sendo
 * decisão deste módulo — é regra de ordem, não vocabulário.
 */
const TRADABLE_SYMBOL = BITCOIN;

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    /**
     * Cotações pela **interface**, nunca pela Binance: é o ponto de inversão
     * de dependência do projeto. Trocar de fonte de preço não toca neste
     * arquivo, e o teste injeta um dublê sem subir rede.
     */
    @Inject(QUOTES_PROVIDER) private readonly quotes: QuotesProvider,
  ) {}

  /**
   * Compra cripto com o dinheiro fictício da liga.
   *
   * A ordem das verificações é deliberada, da mais barata para a mais cara, e
   * nenhuma delas acontece depois de a próxima ter efeito colateral:
   *
   * 1. ativo negociável e quantidade positiva — não custam nada;
   * 2. a pessoa participa da liga (autorização) e a liga está em andamento;
   * 3. só então busca o preço, que é uma chamada de rede;
   * 4. confere o saldo para dar uma mensagem clara;
   * 5. executa, e é o banco quem de fato impede o saldo negativo.
   *
   * Buscar a cotação antes de autorizar gastaria uma chamada à Binance por
   * tentativa de quem nem participa da liga.
   */
  async buy(input: BuyInput): Promise<ExecutedOrder> {
    if (input.symbol !== TRADABLE_SYMBOL) {
      throw new UnsupportedOrderSymbolError(input.symbol);
    }

    // O DTO garantiu o formato; o "maior que zero" é regra e mora aqui.
    if (!isPositiveAmount(input.quantity)) {
      throw new NonPositiveOrderQuantityError(input.quantity);
    }

    const participant = await this.orders.findParticipantContext(
      input.leagueId,
      input.userId,
    );

    // Liga inexistente e liga de que a pessoa não participa respondem igual, de
    // propósito: distinguir as duas entregaria a existência de ligas alheias a
    // quem for tentando ids (ver leagues.errors.ts).
    if (!participant) {
      throw new NotALeagueParticipantError(input.leagueId, input.userId);
    }

    // O "agora" entra no sistema aqui, num lugar só, e é o mesmo instante usado
    // para decidir a situação da liga e, logo abaixo, para buscar o preço.
    const now = new Date();
    const status = leagueStatusAt(participant, now);

    if (status !== 'running') {
      throw new LeagueNotRunningError(input.leagueId, status);
    }

    // O preço vem do backend, sempre. Cotação indisponível interrompe a ordem
    // aqui, com `QuotesUnavailableError` (503) — nada é gravado, e em nenhum
    // caso se executa com preço antigo ou chutado.
    const quote = await this.quotes.bitcoinPrice();
    const totalCost = orderCost(input.quantity, quote.price);

    // Conferência amigável: existe para a pessoa receber "faltam X" em vez de
    // uma recusa seca. Quem de fato impede o saldo negativo é a escrita
    // condicional no banco, logo abaixo.
    if (!balanceCovers(participant.cashBalance, totalCost)) {
      throw new InsufficientBalanceError(
        participant.participantId,
        participant.cashBalance,
        totalCost,
      );
    }

    const executed = await this.orders.executeBuy({
      participantId: participant.participantId,
      symbol: input.symbol,
      quantity: input.quantity,
      unitPrice: quote.price,
      totalCost,
    });

    /*
     * `null` só acontece na corrida: outra ordem da mesma pessoa gastou o
     * dinheiro entre a conferência acima e o commit. O saldo informado na
     * mensagem é o que foi lido antes — já desatualizado, mas é a leitura que
     * esta requisição teve, e o erro diz exatamente o que aconteceu: o custo
     * não coube.
     */
    if (!executed) {
      throw new InsufficientBalanceError(
        participant.participantId,
        participant.cashBalance,
        totalCost,
      );
    }

    return {
      id: executed.orderId,
      symbol: input.symbol,
      quantity: input.quantity,
      unitPrice: quote.price,
      totalCost,
      executedAt: executed.executedAt,
      cashBalance: executed.cashBalance,
      positionQuantity: executed.positionQuantity,
    };
  }
}
