import { Test } from '@nestjs/testing';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { Quote, QuotesProvider } from '../quotes/quotes-provider.js';
import { QuotesUnavailableError } from '../quotes/quotes.errors.js';
import {
  InsufficientBalanceError,
  LeagueNotRunningError,
  NonPositiveOrderQuantityError,
  UnsupportedOrderSymbolError,
} from './orders.errors.js';
import { OrdersRepository } from './orders.repository.js';
import type {
  BuyToExecute,
  ExecutedBuy,
  ParticipantContext,
} from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * Regras da compra, sem banco, sem rede e sem subir servidor: repositório e
 * cotação entram como dublês.
 *
 * O que está sob teste é o que o service **decide** — a quem recusar, em que
 * ordem conferir, qual preço aplicar e o que nunca chega a ser gravado. A
 * aritmética do custo é testada à parte (order-cost.spec.ts) e a atomicidade
 * da escrita é do banco, verificada à mão contra o Postgres.
 */

const LIGA = '0199c0de-0000-7000-8000-000000000001';
const PESSOA = '0199c0de-0000-7000-8000-000000000002';
const PARTICIPACAO = '0199c0de-0000-7000-8000-000000000003';
const PRECO = '80000';
const HORA = 60 * 60 * 1000;

/** Liga em andamento: começou há uma hora e termina daqui a uma hora. */
function ligaEmAndamento(): Pick<ParticipantContext, 'startsAt' | 'endsAt'> {
  const agora = Date.now();
  return {
    startsAt: new Date(agora - HORA),
    endsAt: new Date(agora + HORA),
  };
}

function contexto(
  saldo: string,
  periodo = ligaEmAndamento(),
): ParticipantContext {
  return { participantId: PARTICIPACAO, cashBalance: saldo, ...periodo };
}

/**
 * Repositório dublê: guarda o que o service mandou executar, para o teste
 * conferir **o que teria sido gravado** — é onde se vê se o preço aplicado foi
 * o do backend e se o custo foi o truncado.
 */
class RepositorioFake {
  /** `null` simula participação inexistente (ou liga de que a pessoa está fora). */
  contextoAtual: ParticipantContext | null = contexto('10000');

  /** Quando `true`, a escrita condicional não casa: é a corrida por saldo. */
  simularCorrida = false;

  executado?: BuyToExecute;

  findParticipantContext(): Promise<ParticipantContext | null> {
    return Promise.resolve(this.contextoAtual);
  }

  executeBuy(buy: BuyToExecute): Promise<ExecutedBuy | null> {
    this.executado = buy;

    if (this.simularCorrida) return Promise.resolve(null);

    return Promise.resolve({
      orderId: 'id-da-ordem',
      executedAt: new Date(),
      cashBalance: '0',
      positionQuantity: buy.quantity,
    });
  }
}

/**
 * Cotação dublê.
 *
 * Honra o mesmo contrato da real **inclusive no erro**: quando configurado
 * para falhar, lança `QuotesUnavailableError`, que é o que o
 * `BinanceQuotesProvider` lança em rate limit ou queda. Um dublê que nunca
 * falha faria o teste passar e a produção quebrar.
 */
class CotacaoFake implements QuotesProvider {
  preco = PRECO;
  indisponivel = false;
  chamadas = 0;

  bitcoinPrice(): Promise<Quote> {
    this.chamadas++;

    if (this.indisponivel) {
      return Promise.reject(new QuotesUnavailableError('dublê configurado para falhar'));
    }

    return Promise.resolve({
      symbol: 'BTC',
      price: this.preco,
      asOf: new Date(),
    });
  }
}

describe('OrdersService.buy', () => {
  let service: OrdersService;
  let repositorio: RepositorioFake;
  let cotacao: CotacaoFake;

  beforeEach(async () => {
    repositorio = new RepositorioFake();
    cotacao = new CotacaoFake();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrdersRepository, useValue: repositorio },
        { provide: QUOTES_PROVIDER, useValue: cotacao },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  function comprar(quantity = '0.05', symbol = 'BTC') {
    return service.buy({ leagueId: LIGA, userId: PESSOA, symbol, quantity });
  }

  it('executa a compra pelo preço que o backend buscou', async () => {
    const ordem = await comprar('0.05');

    // 0.05 × 80000 = 4000. O preço aplicado é o da cotação, nunca um informado
    // pelo cliente — o payload sequer tem campo de preço.
    expect(ordem.unitPrice).toBe(PRECO);
    expect(ordem.totalCost).toBe('4000');
    expect(ordem.quantity).toBe('0.05');
  });

  it('manda gravar exatamente o custo que debitou o saldo', async () => {
    // Se o custo gravado divergisse do debitado, o extrato não fecharia com a
    // carteira — e nenhuma tela mostraria a diferença.
    const ordem = await comprar('0.05');

    expect(repositorio.executado?.totalCost).toBe(ordem.totalCost);
    expect(repositorio.executado?.unitPrice).toBe(ordem.unitPrice);
  });

  it('recusa quem não participa da liga, sem consultar a cotação', async () => {
    repositorio.contextoAtual = null;

    await expect(comprar()).rejects.toBeInstanceOf(NotALeagueParticipantError);

    // Buscar o preço antes de autorizar gastaria uma chamada à Binance por
    // tentativa de quem nem está na liga.
    expect(cotacao.chamadas).toBe(0);
  });

  it('responde igual para liga inexistente e liga alheia', async () => {
    // Os dois casos chegam como `null` do repositório, de propósito:
    // distinguir entregaria a existência de ligas alheias a quem tentar ids.
    repositorio.contextoAtual = null;

    await expect(comprar()).rejects.toBeInstanceOf(NotALeagueParticipantError);
  });

  it('recusa liga que ainda não começou', async () => {
    const agora = Date.now();
    repositorio.contextoAtual = contexto('10000', {
      startsAt: new Date(agora + HORA),
      endsAt: new Date(agora + 2 * HORA),
    });

    await expect(comprar()).rejects.toBeInstanceOf(LeagueNotRunningError);
    expect(repositorio.executado).toBeUndefined();
  });

  it('recusa liga encerrada', async () => {
    const agora = Date.now();
    repositorio.contextoAtual = contexto('10000', {
      startsAt: new Date(agora - 2 * HORA),
      endsAt: new Date(agora - HORA),
    });

    await expect(comprar()).rejects.toBeInstanceOf(LeagueNotRunningError);
    expect(repositorio.executado).toBeUndefined();
  });

  it('diz ao cliente qual dos dois casos é, sem vazar o id da liga', async () => {
    const agora = Date.now();
    repositorio.contextoAtual = contexto('10000', {
      startsAt: new Date(agora + HORA),
      endsAt: new Date(agora + 2 * HORA),
    });

    /*
     * A asserção é sobre `publicMessage`, não sobre `message`: o projeto separa
     * os dois de propósito — `message` carrega id de liga e situação para o
     * log, e só `publicMessage` chega ao cliente. Testar o `message` daria a
     * falsa impressão de que a tela está coberta.
     *
     * "ainda não começou" e "já encerrou" levam à mesma conclusão, mas saber
     * qual evita a pessoa ficar tentando.
     */
    await expect(comprar()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LeagueNotRunningError &&
        error.publicMessage.includes('ainda não começou') &&
        !error.publicMessage.includes(LIGA),
    );
  });

  it('usa a outra mensagem quando a liga já encerrou', async () => {
    const agora = Date.now();
    repositorio.contextoAtual = contexto('10000', {
      startsAt: new Date(agora - 2 * HORA),
      endsAt: new Date(agora - HORA),
    });

    await expect(comprar()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LeagueNotRunningError &&
        error.publicMessage.includes('já encerrou'),
    );
  });

  it('recusa ativo que a plataforma não negocia, antes de qualquer consulta', async () => {
    await expect(comprar('0.05', 'DOGE')).rejects.toBeInstanceOf(
      UnsupportedOrderSymbolError,
    );
    expect(cotacao.chamadas).toBe(0);
    expect(repositorio.executado).toBeUndefined();
  });

  it('recusa quantidade zero', async () => {
    await expect(comprar('0')).rejects.toBeInstanceOf(
      NonPositiveOrderQuantityError,
    );
    expect(repositorio.executado).toBeUndefined();
  });

  it('recusa quantidade zero escrita com casas decimais', async () => {
    await expect(comprar('0.00000000')).rejects.toBeInstanceOf(
      NonPositiveOrderQuantityError,
    );
  });

  it('recusa quando o saldo não cobre o custo, sem tentar gravar', async () => {
    repositorio.contextoAtual = contexto('100');

    // 0.05 × 80000 = 4000, com saldo de 100.
    await expect(comprar('0.05')).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
    expect(repositorio.executado).toBeUndefined();
  });

  it('aceita gastar o saldo inteiro, até o último centavo', async () => {
    repositorio.contextoAtual = contexto('4000');

    // Zerar o saldo é operação legítima: o limite é não ficar negativo.
    const ordem = await comprar('0.05');

    expect(ordem.totalCost).toBe('4000');
  });

  it('recusa quando falta um satoshi para o custo', async () => {
    repositorio.contextoAtual = contexto('3999.99999999');

    // A borda que um `Number` poderia deixar passar.
    await expect(comprar('0.05')).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
  });

  it('trata a corrida por saldo como saldo insuficiente', async () => {
    // A conferência do service passou, mas outra ordem da mesma pessoa gastou
    // o dinheiro antes do commit: a escrita condicional do banco não casou.
    repositorio.simularCorrida = true;

    await expect(comprar('0.05')).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
  });

  it('não grava nada quando a cotação está indisponível', async () => {
    cotacao.indisponivel = true;

    // Interrompe com o erro da cotação (503), em vez de executar com preço
    // antigo ou chutado.
    await expect(comprar()).rejects.toBeInstanceOf(QuotesUnavailableError);
    expect(repositorio.executado).toBeUndefined();
  });

  it('trunca o custo na oitava casa, sem arredondar', async () => {
    cotacao.preco = '82115.12';
    repositorio.contextoAtual = contexto('100000');

    const ordem = await comprar('0.12345678');

    // 10137.6683045136 truncado. É o valor que vai para o banco nas duas
    // colunas (débito e registro).
    expect(ordem.totalCost).toBe('10137.66830451');
  });
});
