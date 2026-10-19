import { covers, orderCost } from './order-cost.js';

/**
 * A conta mais delicada do produto: quanto sai do saldo numa compra e quanto
 * entra nele numa venda.
 *
 * O que está sob teste é a **precisão** e a **regra de truncamento**, não o
 * caminho feliz: um erro aqui não quebra nada visivelmente — só grava o valor
 * errado, para sempre, no registro que deveria ser auditável.
 *
 * Sem Nest, sem banco e sem rede.
 */

describe('orderCost', () => {
  it('multiplica sem perder precisão onde o float perderia', () => {
    // Em ponto flutuante, 0.1 × 82115.12 dá 8211.511999999999. A conta exata é
    // 8211.512, e é esta que precisa debitar o saldo.
    expect(orderCost('0.1', '82115.12')).toBe('8211.512');
  });

  it('trunca na oitava casa, sem arredondar', () => {
    // 0.12345678 × 82115.12 = 10137.6683045136 (dez casas). O dígito seguinte à
    // oitava casa é 3, então truncar e arredondar coincidem aqui.
    expect(orderCost('0.12345678', '82115.12')).toBe('10137.66830451');
  });

  it('descarta o resto mesmo quando o arredondamento subiria', () => {
    // 0.00000009 × 1.00000009 = 0.0000000900000008, cuja nona casa em diante é
    // descartada. É a diferença entre truncar e arredondar: meio-para-cima
    // devolveria o mesmo aqui, mas a regra decidida é não olhar o resto.
    expect(orderCost('0.99999999', '0.99999999')).toBe('0.99999998');
  });

  it('mantém precisão com valores grandes, onde o padrão do decimal.js cortaria', () => {
    // 24 dígitos significativos. Com a precisão padrão de 20 do decimal.js, o
    // produto já sairia arredondado antes do truncamento — é o motivo do
    // `clone({ precision: 50 })`.
    expect(orderCost('123.45678901', '82115.12345678')).toBe('10137669.47113379');
  });

  it('aceita quantidade inteira e preço sem decimais', () => {
    expect(orderCost('2', '80000')).toBe('160000');
  });

  it('nunca devolve notação exponencial', () => {
    // `toString()` do decimal.js devolveria "1e-8" aqui, que nem o Postgres nem
    // a tela saberiam ler. O `toFixed()` é o que garante a forma decimal.
    expect(orderCost('0.00000001', '1')).toBe('0.00000001');
  });
});

describe('covers', () => {
  it('aceita quando o saldo é maior', () => {
    expect(covers('10000', '8211.512')).toBe(true);
  });

  it('aceita quando o saldo é exatamente o custo', () => {
    // Gastar tudo é uma operação legítima: o saldo vai a zero, não a negativo.
    expect(covers('8211.512', '8211.512')).toBe(true);
  });

  it('recusa quando falta um satoshi', () => {
    // A borda que importa. Com `Number`, os dois valores poderiam ser lidos
    // como iguais e a compra passaria.
    expect(covers('8211.51199999', '8211.512')).toBe(false);
  });

  it('recusa com saldo zerado', () => {
    expect(covers('0', '0.00000001')).toBe(false);
  });

  it('compara sem erro de ponto flutuante', () => {
    // 0.1 + 0.2 = 0.30000000000000004 em float; em decimal, 0.3 exato. Um saldo
    // de 0.3 cobre um custo de 0.3.
    expect(covers('0.3', '0.3')).toBe(true);
  });

  /*
   * A mesma função responde pela carteira na venda. Os casos abaixo são os
   * mesmos de cima com outro significado — e é esse o ponto: "ter o
   * suficiente" é uma comparação só no produto.
   */

  it('aceita vender a posição inteira', () => {
    // Zerar a carteira é legítimo, como zerar o saldo.
    expect(covers('0.0623', '0.0623')).toBe(true);
  });

  it('recusa vender um satoshi a mais do que se tem', () => {
    // A borda que impede a posição negativa — venda a descoberto não existe.
    expect(covers('0.0623', '0.06230001')).toBe(false);
  });

  it('recusa qualquer venda de quem nunca comprou', () => {
    // Sem posição, o repositório devolve "0": aqui nada passa.
    expect(covers('0', '0.00000001')).toBe(false);
  });
});
