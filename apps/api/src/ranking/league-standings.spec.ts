import { rankParticipants } from './league-standings.js';
import type { ParticipantHolding } from './league-standings.js';

/**
 * A regra do ranking: quem está na frente, por quanto, e o que acontece quando
 * ninguém está na frente.
 *
 * O que está sob teste é a **ordenação com empate** e a **precisão** do
 * patrimônio. Um erro aqui não quebra nada visivelmente — só coroa o
 * participante errado, que é o resultado inteiro do produto.
 *
 * Sem Nest, sem banco e sem rede.
 */

const INITIAL_BALANCE = '10000';

/** Participante com saldo e carteira ditos; o resto é ruído para estes testes. */
function holding(
  name: string,
  cashBalance: string,
  bitcoinQuantity = '0',
): ParticipantHolding {
  return { userId: `id-${name}`, name, cashBalance, bitcoinQuantity };
}

describe('rankParticipants', () => {
  it('ordena do maior patrimônio para o menor', () => {
    const standings = rankParticipants(
      [holding('Ana', '9000'), holding('Bia', '11000'), holding('Caio', '10000')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings.map((s) => s.name)).toEqual(['Bia', 'Caio', 'Ana']);
    expect(standings.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('soma o bitcoin ao caixa a preço atual', () => {
    // Trocou metade do caixa por 0.0625 BTC a 80.000 — a carteira vale os
    // mesmos 5.000, então o patrimônio continua 10.000.
    const standings = rankParticipants(
      [holding('Ana', '5000', '0.0625')],
      INITIAL_BALANCE,
      '80000',
    );

    expect(standings[0].bitcoinValue).toBe('5000');
    expect(standings[0].equity).toBe('10000');
    expect(standings[0].returnPercent).toBe('0');
  });

  it('coloca quem está todo em bitcoin na frente quando o preço subiu', () => {
    // Quem comprou 0.125 BTC a 80.000 (gastou os 10.000) vale 11.000 com o BTC
    // a 88.000. É o caso que uma ordenação só por caixa inverteria: a Ana está
    // com zero em caixa e liderando.
    const standings = rankParticipants(
      [holding('Ana', '0', '0.125'), holding('Bia', '10000')],
      INITIAL_BALANCE,
      '88000',
    );

    expect(standings.map((s) => s.name)).toEqual(['Ana', 'Bia']);
    expect(standings[0].equity).toBe('11000');
    expect(standings[0].returnPercent).toBe('10');
  });

  it('dá a mesma colocação a quem empata e pula a seguinte', () => {
    // O estado de toda liga recém-criada: ninguém operou, todos valem a base.
    const standings = rankParticipants(
      [holding('Ana', '10000'), holding('Bia', '10000'), holding('Caio', '9000')],
      INITIAL_BALANCE,
      '0',
    );

    // 1º, 1º, 3º — não existe "2º lugar" quando duas pessoas dividem o 1º.
    expect(standings.map((s) => s.position)).toEqual([1, 1, 3]);
  });

  it('reconhece empate entre saldos escritos de formas diferentes', () => {
    // O Postgres devolve `numeric(20, 8)` com as casas preenchidas, e nem toda
    // linha passa pelo mesmo caminho. Comparados como texto, estes dois não
    // empatariam; comparados como decimal, são o mesmo número.
    const standings = rankParticipants(
      [holding('Ana', '10000.00000000'), holding('Bia', '10000')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings.map((s) => s.position)).toEqual([1, 1]);
  });

  it('mantém a ordem de entrada entre quem empata', () => {
    // A lista chega ordenada por entrada na liga (ver ranking.repository.ts) e
    // a ordenação é estável, então duas consultas seguidas devolvem a mesma
    // sequência — sem isso, a tela reembaralharia empatados a cada abertura.
    const standings = rankParticipants(
      [holding('Ana', '10000'), holding('Bia', '10000'), holding('Caio', '10000')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings.map((s) => s.name)).toEqual(['Ana', 'Bia', 'Caio']);
  });

  it('calcula o percentual sobre a base da liga, com duas casas', () => {
    const standings = rankParticipants(
      [holding('Ana', '10430'), holding('Bia', '9876.54')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings[0].returnPercent).toBe('4.3');
    expect(standings[1].returnPercent).toBe('-1.23');
  });

  it('arredonda o percentual para cima na metade, sem truncar', () => {
    // +0,009% viraria "+0.00%" se o percentual seguisse o truncamento das
    // ordens. Ele é número de leitura, não dinheiro que se move: arredonda.
    const standings = rankParticipants(
      [holding('Ana', '10000.9')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings[0].returnPercent).toBe('0.01');
  });

  it('não deixa o percentual arredondado desfazer um empate ou criar outro', () => {
    // Os dois exibem "0.01%", e mesmo assim a Ana está na frente: a colocação
    // sai do patrimônio exato, não do número arredondado da tela.
    const standings = rankParticipants(
      [holding('Ana', '10000.9'), holding('Bia', '10000.8')],
      INITIAL_BALANCE,
      '0',
    );

    expect(standings.map((s) => s.returnPercent)).toEqual(['0.01', '0.01']);
    expect(standings.map((s) => s.position)).toEqual([1, 2]);
  });

  it('soma sem perder precisão onde o float perderia', () => {
    // 0.1 + 0.2 dá 0.30000000000000004 em ponto flutuante. Aqui a soma é exata.
    const standings = rankParticipants(
      [holding('Ana', '0.1', '0.2')],
      INITIAL_BALANCE,
      '1',
    );

    expect(standings[0].equity).toBe('0.3');
  });

  it('trunca o valor da carteira na oitava casa, como o custo de uma ordem', () => {
    // Mesma função e mesma regra do order-cost: 0.12345678 × 82115.12 dá
    // 10137.6683045136 e o que passa da oitava casa é descartado.
    const standings = rankParticipants(
      [holding('Ana', '0', '0.12345678')],
      INITIAL_BALANCE,
      '82115.12',
    );

    expect(standings[0].bitcoinValue).toBe('10137.66830451');
  });

  it('nunca devolve notação exponencial', () => {
    // `toString()` do decimal.js devolveria "1e-8", que a tela não sabe ler.
    const standings = rankParticipants(
      [holding('Ana', '0', '0.00000001')],
      INITIAL_BALANCE,
      '1',
    );

    expect(standings[0].equity).toBe('0.00000001');
  });

  it('trata quem nunca comprou como carteira zerada', () => {
    const standings = rankParticipants([holding('Ana', '10000')], INITIAL_BALANCE, '0');

    expect(standings[0].bitcoinValue).toBe('0');
    expect(standings[0].equity).toBe('10000');
  });

  it('devolve lista vazia para liga sem participantes', () => {
    // Não acontece hoje — toda liga nasce com quem a criou —, mas a função é
    // pura e não deve estourar por isso.
    expect(rankParticipants([], INITIAL_BALANCE, '80000')).toEqual([]);
  });

  it('ranqueia a liga de uma pessoa só', () => {
    const standings = rankParticipants([holding('Ana', '10000')], INITIAL_BALANCE, '0');

    expect(standings).toHaveLength(1);
    expect(standings[0].position).toBe(1);
  });
});
