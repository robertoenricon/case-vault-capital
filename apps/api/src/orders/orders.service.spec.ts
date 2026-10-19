import { Test } from '@nestjs/testing';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { Quote, QuotesProvider } from '../quotes/quotes-provider.js';
import { QuotesUnavailableError } from '../quotes/quotes.errors.js';
import type { OrderSide } from './order-side.js';
import {
  InsufficientBalanceError,
  InsufficientPositionError,
  LeagueNotRunningError,
  NonPositiveOrderQuantityError,
  UnsupportedOrderSymbolError,
} from './orders.errors.js';
import { OrdersRepository } from './orders.repository.js';
import type {
  OrderOutcome,
  OrderToExecute,
  ParticipantContext,
} from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * Regras da ordem, sem banco, sem rede e sem subir servidor: repositório e
 * cotação entram como dublês.
 *
 * O que está sob teste é o que o service **decide** — a quem recusar, em que
 * ordem conferir, qual preço aplicar e o que nunca chega a ser gravado. A
 * aritmética do valor é testada à parte (order-cost.spec.ts) e a atomicidade
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

/**
 * Participação como o repositório a devolve.
 *
 * A carteira é parâmetro com padrão `'0'` porque é assim que quem nunca
 * comprou chega ao service: o repositório traduz a ausência de linha em zero.
 */
function contexto(
  saldo: string,
  carteira = '0',
  periodo = ligaEmAndamento(),
): ParticipantContext {
  return {
    participantId: PARTICIPACAO,
    cashBalance: saldo,
    positionQuantity: carteira,
    ...periodo,
  };
}

/**
 * Repositório dublê: guarda o que o service mandou executar, para o teste
 * conferir **o que teria sido gravado** — é onde se vê se o preço aplicado foi
 * o do backend e se o valor foi o truncado.
 */
class RepositorioFake {
  /** `null` simula participação inexistente (ou liga de que a pessoa está fora). */
  contextoAtual: ParticipantContext | null = contexto('10000');

  /**
   * Quando `true`, a escrita condicional não casa: é a corrida — por saldo na
   * compra, por carteira na venda.
   */
  simularCorrida = false;

  executado?: OrderToExecute;
  ladoExecutado?: OrderSide;

  findParticipantContext(): Promise<ParticipantContext | null> {
    return Promise.resolve(this.contextoAtual);
  }

  executeBuy(buy: OrderToExecute): Promise<OrderOutcome | null> {
    return this.registrar('buy', buy);
  }

  executeSell(sell: OrderToExecute): Promise<OrderOutcome | null> {
    return this.registrar('sell', sell);
  }

  private registrar(
    side: OrderSide,
    order: OrderToExecute,
  ): Promise<OrderOutcome | null> {
    this.executado = order;
    this.ladoExecutado = side;

    if (this.simularCorrida) return Promise.resolve(null);

    return Promise.resolve({
      orderId: 'id-da-ordem',
      executedAt: new Date(),
      cashBalance: '0',
      positionQuantity: order.quantity,
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

describe('OrdersService', () => {
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
    return service.place({
      leagueId: LIGA,
      userId: PESSOA,
      side: 'buy',
      symbol,
      quantity,
    });
  }

  function vender(quantity = '0.05', symbol = 'BTC') {
    return service.place({
      leagueId: LIGA,
      userId: PESSOA,
      side: 'sell',
      symbol,
      quantity,
    });
  }

  describe('compra', () => {
    it('executa a compra pelo preço que o backend buscou', async () => {
      const ordem = await comprar('0.05');

      // 0.05 × 80000 = 4000. O preço aplicado é o da cotação, nunca um
      // informado pelo cliente — o payload sequer tem campo de preço.
      expect(ordem.unitPrice).toBe(PRECO);
      expect(ordem.totalCost).toBe('4000');
      expect(ordem.quantity).toBe('0.05');
      expect(ordem.side).toBe('buy');
    });

    it('manda gravar exatamente o custo que debitou o saldo', async () => {
      // Se o custo gravado divergisse do debitado, o extrato não fecharia com
      // a carteira — e nenhuma tela mostraria a diferença.
      const ordem = await comprar('0.05');

      expect(repositorio.ladoExecutado).toBe('buy');
      expect(repositorio.executado?.totalCost).toBe(ordem.totalCost);
      expect(repositorio.executado?.unitPrice).toBe(ordem.unitPrice);
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
      // A conferência do service passou, mas outra ordem da mesma pessoa
      // gastou o dinheiro antes do commit: a escrita condicional não casou.
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

  describe('venda', () => {
    /** Carteira com 0,05 BTC e nenhum dinheiro — o oposto do caso da compra. */
    function comCarteira(carteira = '0.05', saldo = '0') {
      repositorio.contextoAtual = contexto(saldo, carteira);
    }

    it('executa a venda pelo preço que o backend buscou', async () => {
      comCarteira('0.05');

      const ordem = await vender('0.05');

      expect(ordem.side).toBe('sell');
      expect(ordem.unitPrice).toBe(PRECO);
      // Mesma conta da compra: o que muda é a direção do dinheiro.
      expect(ordem.totalCost).toBe('4000');
    });

    it('manda gravar exatamente o valor que creditou o saldo', async () => {
      comCarteira('0.05');

      const ordem = await vender('0.05');

      expect(repositorio.ladoExecutado).toBe('sell');
      expect(repositorio.executado?.totalCost).toBe(ordem.totalCost);
      expect(repositorio.executado?.unitPrice).toBe(ordem.unitPrice);
    });

    it('recusa vender mais do que a carteira tem, sem consultar a cotação', async () => {
      comCarteira('0.05');

      await expect(vender('0.06')).rejects.toBeInstanceOf(
        InsufficientPositionError,
      );

      /*
       * A ordem das verificações na venda é invertida em relação à compra, de
       * propósito: a carteira já veio com a participação, então recusar não
       * custa chamada de rede. Na compra, sem preço não há custo a comparar.
       */
      expect(cotacao.chamadas).toBe(0);
      expect(repositorio.executado).toBeUndefined();
    });

    it('recusa qualquer venda de quem nunca comprou', async () => {
      // Carteira zero é como o repositório entrega quem não tem linha em
      // `positions` — não existe caso "sem posição" separado no service.
      comCarteira('0');

      await expect(vender('0.00000001')).rejects.toBeInstanceOf(
        InsufficientPositionError,
      );
      expect(repositorio.executado).toBeUndefined();
    });

    it('aceita vender a posição inteira', async () => {
      comCarteira('0.05');

      // Zerar a carteira é legítimo: o limite é não ficar negativa.
      const ordem = await vender('0.05');

      expect(ordem.totalCost).toBe('4000');
    });

    it('recusa quando falta um satoshi na carteira', async () => {
      comCarteira('0.04999999');

      // A borda que um `Number` poderia deixar passar — e que é a diferença
      // entre existir e não existir venda a descoberto.
      await expect(vender('0.05')).rejects.toBeInstanceOf(
        InsufficientPositionError,
      );
    });

    it('trata a corrida por carteira como posição insuficiente', async () => {
      comCarteira('0.05');
      // A conferência passou, mas outra venda da mesma pessoa consumiu a
      // posição antes do commit: a escrita condicional não casou.
      repositorio.simularCorrida = true;

      await expect(vender('0.05')).rejects.toBeInstanceOf(
        InsufficientPositionError,
      );
    });

    it('diz quanto a pessoa tem, sem vazar o id da participação', async () => {
      comCarteira('0.05');

      /*
       * Asserção sobre `publicMessage`, não sobre `message`: o projeto separa
       * os dois de propósito — `message` carrega ids para o log, e só
       * `publicMessage` chega ao cliente.
       */
      await expect(vender('0.06')).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof InsufficientPositionError &&
          error.publicMessage.includes('0.05') &&
          !error.publicMessage.includes(PARTICIPACAO),
      );
    });

    it('não grava nada quando a cotação está indisponível', async () => {
      comCarteira('0.05');
      cotacao.indisponivel = true;

      await expect(vender()).rejects.toBeInstanceOf(QuotesUnavailableError);
      expect(repositorio.executado).toBeUndefined();
    });

    it('trunca o valor recebido na oitava casa, creditando de menos', async () => {
      cotacao.preco = '82115.12';
      comCarteira('1');

      const ordem = await vender('0.12345678');

      /*
       * 10137.6683045136 truncado — o mesmo número da compra. Na venda o
       * truncamento cai para o outro lado: credita de menos, nunca a mais.
       * O viés é "a favor do número menor", não "a favor de quem opera", e
       * isso é decisão consciente: uma regra de arredondamento só no produto
       * inteiro.
       */
      expect(ordem.totalCost).toBe('10137.66830451');
    });

    it('não exige saldo em dinheiro para vender', async () => {
      // Quem gastou tudo comprando precisa poder desfazer a posição.
      comCarteira('0.05', '0');

      await expect(vender('0.05')).resolves.toMatchObject({ side: 'sell' });
    });
  });

  /*
   * As verificações abaixo valem igual para os dois lados — ativo, quantidade,
   * participação e janela da liga vivem num caminho só no service. Os casos
   * são escritos na compra e repetidos na venda apenas onde a repetição prova
   * que o caminho é mesmo compartilhado.
   */
  describe('o que vale para os dois lados', () => {
    it('recusa quem não participa da liga, sem consultar a cotação', async () => {
      repositorio.contextoAtual = null;

      await expect(comprar()).rejects.toBeInstanceOf(NotALeagueParticipantError);

      // Buscar o preço antes de autorizar gastaria uma chamada à Binance por
      // tentativa de quem nem está na liga.
      expect(cotacao.chamadas).toBe(0);
    });

    it('recusa também a venda de quem não participa da liga', async () => {
      repositorio.contextoAtual = null;

      await expect(vender()).rejects.toBeInstanceOf(NotALeagueParticipantError);
      expect(repositorio.executado).toBeUndefined();
    });

    it('responde igual para liga inexistente e liga alheia', async () => {
      // Os dois casos chegam como `null` do repositório, de propósito:
      // distinguir entregaria a existência de ligas alheias a quem tentar ids.
      repositorio.contextoAtual = null;

      await expect(comprar()).rejects.toBeInstanceOf(NotALeagueParticipantError);
    });

    it('recusa liga que ainda não começou', async () => {
      const agora = Date.now();
      repositorio.contextoAtual = contexto('10000', '0', {
        startsAt: new Date(agora + HORA),
        endsAt: new Date(agora + 2 * HORA),
      });

      await expect(comprar()).rejects.toBeInstanceOf(LeagueNotRunningError);
      expect(repositorio.executado).toBeUndefined();
    });

    it('recusa liga encerrada', async () => {
      const agora = Date.now();
      repositorio.contextoAtual = contexto('10000', '0', {
        startsAt: new Date(agora - 2 * HORA),
        endsAt: new Date(agora - HORA),
      });

      await expect(comprar()).rejects.toBeInstanceOf(LeagueNotRunningError);
      expect(repositorio.executado).toBeUndefined();
    });

    it('recusa vender numa liga encerrada, mesmo com posição', async () => {
      // Liquidar depois do fim mudaria o patrimônio final — o ranking passaria
      // a comparar pessoas que operaram em janelas diferentes.
      const agora = Date.now();
      repositorio.contextoAtual = contexto('0', '0.05', {
        startsAt: new Date(agora - 2 * HORA),
        endsAt: new Date(agora - HORA),
      });

      await expect(vender('0.05')).rejects.toBeInstanceOf(LeagueNotRunningError);
      expect(repositorio.executado).toBeUndefined();
    });

    it('diz ao cliente qual dos dois casos é, sem vazar o id da liga', async () => {
      const agora = Date.now();
      repositorio.contextoAtual = contexto('10000', '0', {
        startsAt: new Date(agora + HORA),
        endsAt: new Date(agora + 2 * HORA),
      });

      /*
       * A asserção é sobre `publicMessage`, não sobre `message`: o projeto
       * separa os dois de propósito — `message` carrega id de liga e situação
       * para o log, e só `publicMessage` chega ao cliente. Testar o `message`
       * daria a falsa impressão de que a tela está coberta.
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
      repositorio.contextoAtual = contexto('10000', '0', {
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

    it('recusa vender ativo que a plataforma não negocia', async () => {
      await expect(vender('0.05', 'DOGE')).rejects.toBeInstanceOf(
        UnsupportedOrderSymbolError,
      );
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

    it('recusa venda de quantidade zero', async () => {
      // Antes da carteira: vender zero não é uma operação, mesmo com posição.
      repositorio.contextoAtual = contexto('0', '0.05');

      await expect(vender('0')).rejects.toBeInstanceOf(
        NonPositiveOrderQuantityError,
      );
      expect(repositorio.executado).toBeUndefined();
    });
  });
});
