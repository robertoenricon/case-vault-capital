import { Prisma } from '../generated/prisma/client.js';
import { orderCost } from '../orders/order-cost.js';

/**
 * A regra do ranking: quanto cada participante vale agora e quem está na
 * frente.
 *
 * Função pura, longe de Nest, banco e rede — o preço e os saldos chegam por
 * parâmetro. É o que permite testar empate, precisão e ordenação sem subir
 * nada (ver league-standings.spec.ts).
 *
 * **A métrica é o patrimônio**: caixa + bitcoin avaliado a preço atual. O
 * percentual sai junto, sobre o saldo inicial da liga, e é só leitura — não
 * participa da ordenação. Como `leagues.initial_balance` é o mesmo para todo
 * mundo na mesma liga (inclusive para quem entra depois, ver schema.prisma),
 * ordenar por patrimônio e ordenar por percentual dá **exatamente a mesma
 * ordem**: a base é constante, então o percentual é o patrimônio reescalado.
 * Escolher entre as duas métricas seria escolher o que exibir, não quem ganha.
 */

/**
 * Aritmética com 50 dígitos significativos, como em order-cost.ts e pelo mesmo
 * motivo: a soma de dois valores de `numeric(20, 8)` pode passar dos 20
 * dígitos que o decimal.js usa por padrão, e a divisão do percentual não é
 * exata. Com a precisão padrão, o resultado sairia arredondado antes de chegar
 * ao arredondamento que está decidido abaixo.
 *
 * `clone`, nunca `Decimal.set`: configurar o decimal.js global mudaria toda
 * leitura de `numeric` que o Prisma faz na aplicação.
 */
const Equity = Prisma.Decimal.clone({ precision: 50 });

/**
 * Casas do percentual exibido.
 *
 * Duas, porque é número de leitura — "+4,30%" — e não dinheiro que se move.
 * **Não altera a ordem do ranking**, que é decidida pelo patrimônio exato: dois
 * participantes podem exibir o mesmo percentual arredondado e ainda assim
 * ocupar posições diferentes, porque o patrimônio deles difere em centavos.
 */
const PERCENT_PLACES = 2;

/**
 * Participante como o ranking precisa dele: quem é, quanto tem em caixa e
 * quanto tem em bitcoin.
 *
 * Nada de id de participação nem de data de entrada: a ordenação de entrada já
 * veio aplicada pelo repositório (ver ranking.repository.ts), e esta função só
 * precisa dos números.
 */
export type ParticipantHolding = {
  /** Id da **conta** — é por ele que a tela acha a própria linha. */
  userId: string;
  name: string;
  /** Texto decimal, como todo valor monetário que atravessa a aplicação. */
  cashBalance: string;
  /** Quantidade de bitcoin em carteira. `"0"` para quem nunca comprou. */
  bitcoinQuantity: string;
};

/** Uma linha do ranking, já posicionada. */
export type Standing = {
  /**
   * Colocação, a partir de 1. **Empate real divide a posição**: dois
   * patrimônios iguais recebem o mesmo número e o seguinte é pulado (1º, 1º,
   * 3º). No dia zero da liga todo mundo tem exatamente o saldo inicial e
   * ninguém operou — inventar um líder ali seria mostrar como diferença o que
   * é empate.
   */
  position: number;
  userId: string;
  name: string;
  cashBalance: string;
  bitcoinQuantity: string;
  /**
   * Quanto o bitcoin em carteira vale agora, em dólar.
   *
   * Sai na resposta, e não só somado no patrimônio, porque é o que explica a
   * linha: sem ele, quem está com o caixa baixo e muito BTC aparece liderando
   * sem motivo visível.
   */
  bitcoinValue: string;
  /** Patrimônio: `cashBalance + bitcoinValue`. É por ele que o ranking ordena. */
  equity: string;
  /**
   * Variação sobre o saldo inicial da liga, em pontos percentuais —
   * `"4.3"` significa +4,3%. Negativo para quem está perdendo.
   *
   * Sem o sinal de porcentagem e sem separador de milhar: quem formata é a
   * tela, como em todo valor que sai desta API.
   */
  returnPercent: string;
};

/**
 * Valor de mercado de uma posição: quantidade × preço.
 *
 * É de propósito a **mesma função** que calcula o custo de uma ordem, e não
 * uma cópia da conta: o truncamento na oitava casa é uma regra só no produto
 * (ver order-cost.ts), e duas implementações dela um dia discordariam. O nome
 * local existe porque aqui a conta não é o custo de nada — é quanto a carteira
 * vale se fosse vendida agora.
 */
function positionValue(quantity: string, unitPrice: string): string {
  return orderCost(quantity, unitPrice);
}

/**
 * Monta o ranking da liga: avalia cada carteira, ordena por patrimônio e
 * distribui as colocações.
 *
 * @param holdings participantes **já na ordem de entrada na liga**. Essa ordem
 * é o critério de desempate da *lista* (não da colocação): quem empata aparece
 * na sequência em que entrou, para a mesma liga devolver sempre a mesma
 * resposta. A ordenação abaixo é estável, então ela sobrevive.
 *
 * @param initialBalance saldo com que todos começaram, base do percentual.
 * Sempre maior que zero — quem garante é `parseInitialBalance` no boot, e a
 * liga guarda uma cópia do valor validado (ver leagues/initial-balance.ts).
 * Por isso a divisão abaixo não precisa de guarda contra zero.
 *
 * @param unitPrice preço do bitcoin em dólar, obtido pelo backend. Chega como
 * `"0"` quando **ninguém** na liga tem bitcoin: nesse caso o preço não entra
 * na conta (0 × 0 = 0) e o serviço nem chega a consultar a cotação — decisão
 * registrada, ver ranking.service.ts.
 */
export function rankParticipants(
  holdings: ParticipantHolding[],
  initialBalance: string,
  unitPrice: string,
): Standing[] {
  const base = new Equity(initialBalance);

  /*
   * Avalia antes de ordenar, guardando o patrimônio como decimal.
   *
   * Decimal, e não o texto final: a comparação de empate precisa ser
   * numérica. Como texto, "10000" e "10000.00000000" são diferentes, e dois
   * participantes empatados cairiam em posições distintas.
   */
  const valued = holdings.map((holding) => {
    const bitcoinValue = positionValue(holding.bitcoinQuantity, unitPrice);

    return {
      holding,
      bitcoinValue,
      equity: new Equity(holding.cashBalance).plus(bitcoinValue),
    };
  });

  /*
   * Maior patrimônio primeiro. `sort` é estável em todo runtime moderno, então
   * quem empata mantém a ordem de entrada que veio do banco — é o que faz a
   * mesma liga, consultada duas vezes seguidas, devolver a mesma lista.
   */
  const ordered = [...valued].sort((a, b) => b.equity.comparedTo(a.equity));

  const standings: Standing[] = [];

  /*
   * Colocação da linha anterior, carregada à mão em vez de derivada do índice.
   *
   * É o que faz o empate funcionar nos dois sentidos: quem empata com o de
   * cima **repete** a colocação, e quem não empata recebe a própria linha —
   * pulando os números consumidos pelo empate (1º, 1º, 3º) em vez de entregar
   * dois segundos lugares.
   */
  let position = 0;

  for (const [index, entry] of ordered.entries()) {
    const previous = ordered[index - 1];
    const tied = previous?.equity.equals(entry.equity) ?? false;

    if (!tied) position = index + 1;

    standings.push({
      position,
      userId: entry.holding.userId,
      name: entry.holding.name,
      cashBalance: entry.holding.cashBalance,
      bitcoinQuantity: entry.holding.bitcoinQuantity,
      bitcoinValue: entry.bitcoinValue,
      equity: entry.equity.toFixed(),
      returnPercent: returnPercentOf(entry.equity, base),
    });
  }

  return standings;
}

/**
 * Quanto o patrimônio variou sobre a base da liga, em pontos percentuais.
 *
 * `(patrimônio / base - 1) × 100`, arredondado na segunda casa pelo
 * meio-para-cima — e **não truncado** como o valor das ordens.
 *
 * A diferença é deliberada. O truncamento existe para dinheiro que se move:
 * nunca arredondar a favor de quem opera. Aqui nada se move — é um número de
 * leitura, derivado de valores já decididos — e truncar mostraria `+0.00%`
 * para quem subiu 0,009%, o que é menos fiel do que `+0.01%`. Como o
 * percentual não ordena nada, esse arredondamento não altera nenhuma
 * colocação.
 */
function returnPercentOf(equity: Prisma.Decimal, base: Prisma.Decimal): string {
  return equity
    .div(base)
    .minus(1)
    .times(100)
    .toDecimalPlaces(PERCENT_PLACES, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed();
}
