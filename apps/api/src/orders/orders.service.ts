import { Inject, Injectable } from '@nestjs/common';
import { BITCOIN } from '../common/assets.js';
import { leagueStatusAt } from '../leagues/league-status.js';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { QuotesProvider } from '../quotes/quotes-provider.js';
import { covers, isPositiveAmount, orderCost } from './order-cost.js';
import type { OrderSide } from './order-side.js';
import {
  InsufficientBalanceError,
  InsufficientPositionError,
  LeagueNotRunningError,
  NonPositiveOrderQuantityError,
  UnsupportedOrderSymbolError,
} from './orders.errors.js';
import { OrdersRepository } from './orders.repository.js';
import type { ParticipantContext } from './orders.repository.js';

/** Entrada da regra, já validada na borda. Quem opera vem do token. */
export type OrderInput = {
  leagueId: string;
  userId: string;
  /** Comprar ou vender. Obrigatório: não existe lado padrão numa ordem. */
  side: OrderSide;
  symbol: string;
  /** Texto decimal, formato já conferido pelo DTO. */
  quantity: string;
};

/**
 * Ordem executada, como o domínio a entrega.
 *
 * Devolve o preço e o valor **realmente aplicados**, não os que a tela
 * estimou: o preço é buscado no momento da execução e pode ter se movido desde
 * que a pessoa olhou a cotação. Sem estes campos na resposta, a tela não teria
 * como contar o que de fato aconteceu.
 */
export type ExecutedOrder = {
  id: string;
  /** Repetido na resposta de propósito: é o que diz se o dinheiro saiu ou entrou. */
  side: OrderSide;
  symbol: string;
  quantity: string;
  unitPrice: string;
  /** Quanto saiu do saldo (compra) ou entrou nele (venda). */
  totalCost: string;
  executedAt: Date;
  /** Saldo depois da ordem, para a tela atualizar sem nova requisição. */
  cashBalance: string;
  /** Quantidade total do ativo em carteira depois da ordem. */
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
   * Executa uma ordem de compra ou de venda com o dinheiro fictício da liga.
   *
   * Entrada única para os dois lados porque tudo o que decide **se a ordem
   * pode existir** é idêntico: o ativo, a quantidade, a participação e a
   * janela da liga. O que muda é só o que a ordem consome — dinheiro numa
   * ponta, cripto na outra — e isso vive em cada caminho abaixo.
   */
  async place(input: OrderInput): Promise<ExecutedOrder> {
    const participant = await this.authorizeOrder(input);

    return input.side === 'buy'
      ? await this.buy(input, participant)
      : await this.sell(input, participant);
  }

  /**
   * Tudo o que vale igual para comprar e vender: o pedido faz sentido e esta
   * pessoa pode operar nesta liga **agora**.
   *
   * Devolve a participação em vez de só autorizar porque a autorização e os
   * números de que a regra precisa vêm da mesma leitura; separá-los daria duas
   * idas ao banco que poderiam discordar entre si.
   *
   * A ordem das verificações é deliberada, da mais barata para a mais cara, e
   * nenhuma delas acontece depois de a próxima ter efeito colateral. A
   * cotação, que é a única chamada de rede, fica fora daqui de propósito: ela
   * só é buscada depois de a pessoa estar autorizada, para que tentativas de
   * quem nem participa da liga não gastem chamada à Binance.
   */
  private async authorizeOrder(input: OrderInput): Promise<ParticipantContext> {
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
      input.symbol,
    );

    // Liga inexistente e liga de que a pessoa não participa respondem igual, de
    // propósito: distinguir as duas entregaria a existência de ligas alheias a
    // quem for tentando ids (ver leagues.errors.ts).
    if (!participant) {
      throw new NotALeagueParticipantError(input.leagueId, input.userId);
    }

    // O "agora" entra no sistema aqui, num lugar só.
    const status = leagueStatusAt(participant, new Date());

    if (status !== 'running') {
      throw new LeagueNotRunningError(input.leagueId, status);
    }

    return participant;
  }

  /**
   * Compra: troca dinheiro por cripto. O saldo é o limite.
   *
   * O preço vem do backend, sempre. Cotação indisponível interrompe a ordem
   * com `QuotesUnavailableError` (503) — nada é gravado, e em nenhum caso se
   * executa com preço antigo ou chutado.
   */
  private async buy(
    input: OrderInput,
    participant: ParticipantContext,
  ): Promise<ExecutedOrder> {
    const quote = await this.quotes.bitcoinPrice();
    const totalCost = orderCost(input.quantity, quote.price);

    // Conferência amigável: existe para a pessoa receber "faltam X" em vez de
    // uma recusa seca. Quem de fato impede o saldo negativo é a escrita
    // condicional no banco.
    if (!covers(participant.cashBalance, totalCost)) {
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
      side: 'buy',
      symbol: input.symbol,
      quantity: input.quantity,
      unitPrice: quote.price,
      totalCost,
      executedAt: executed.executedAt,
      cashBalance: executed.cashBalance,
      positionQuantity: executed.positionQuantity,
    };
  }

  /**
   * Venda: troca cripto por dinheiro. A carteira é o limite.
   *
   * A conferência da carteira vem **antes** da cotação, invertendo a ordem da
   * compra: aqui o limite já está em mãos (veio com a participação), então
   * recusar quem não tem o ativo não custa nenhuma chamada de rede. Na compra
   * é o contrário — sem preço não há custo a comparar com o saldo.
   */
  private async sell(
    input: OrderInput,
    participant: ParticipantContext,
  ): Promise<ExecutedOrder> {
    // Venda a descoberto não existe neste produto: só se vende o que se tem.
    if (!covers(participant.positionQuantity, input.quantity)) {
      throw new InsufficientPositionError(
        participant.participantId,
        input.symbol,
        participant.positionQuantity,
        input.quantity,
      );
    }

    const quote = await this.quotes.bitcoinPrice();

    // Mesma conta e mesmo truncamento da compra — o que muda é a direção do
    // dinheiro, não a aritmética.
    const totalCost = orderCost(input.quantity, quote.price);

    const executed = await this.orders.executeSell({
      participantId: participant.participantId,
      symbol: input.symbol,
      quantity: input.quantity,
      unitPrice: quote.price,
      totalCost,
    });

    /*
     * `null` é a corrida, do lado da carteira: outra venda da mesma pessoa
     * consumiu a posição entre a conferência acima e o commit. A posição
     * informada é a que esta requisição leu — já desatualizada, mas é o que
     * ela viu, e o erro diz exatamente o que aconteceu.
     */
    if (!executed) {
      throw new InsufficientPositionError(
        participant.participantId,
        input.symbol,
        participant.positionQuantity,
        input.quantity,
      );
    }

    return {
      id: executed.orderId,
      side: 'sell',
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
