import { parseInitialBalance } from './initial-balance.js';

/**
 * Conferência do saldo padrão configurado. O que está sob teste é a recusa: o
 * caminho feliz ensina pouco, e cada valor recusado aqui é um jeito de a liga
 * nascer com o dinheiro errado.
 *
 * Não mexe em `process.env` — a função recebe o valor cru, então o teste não
 * depende do ambiente em que roda.
 */

describe('parseInitialBalance', () => {
  it('aceita o valor configurado e o devolve como texto', () => {
    // Texto, e não número: o valor segue para uma coluna `numeric` e para
    // contas de dinheiro. `toBe('10000')` é parte da regra, não detalhe.
    expect(parseInitialBalance('10000')).toBe('10000');
  });

  it('aceita casas decimais', () => {
    expect(parseInitialBalance('10000.50')).toBe('10000.50');
  });

  it('ignora espaço sobrando no .env', () => {
    // Espaço antes ou depois é erro de digitação invisível no arquivo, não
    // intenção: recusar por isso daria uma falha de subida difícil de entender.
    expect(parseInitialBalance('  10000  ')).toBe('10000');
  });

  it('recusa variável ausente', () => {
    expect(() => parseInitialBalance(undefined)).toThrow(
      /LEAGUE_INITIAL_BALANCE não definida/,
    );
  });

  it('recusa variável vazia', () => {
    // String vazia é o caso de `LEAGUE_INITIAL_BALANCE=` no .env: a variável
    // existe, então um `!== undefined` passaria batido.
    expect(() => parseInitialBalance('')).toThrow(
      /LEAGUE_INITIAL_BALANCE não definida/,
    );
  });

  it('recusa zero', () => {
    // Zero é sintaticamente válido e inútil: ninguém consegue operar. É o erro
    // que mais fácil passaria, porque não parece erro.
    expect(() => parseInitialBalance('0')).toThrow(/maior que zero/);
  });

  it('recusa zero escrito com casas decimais', () => {
    expect(() => parseInitialBalance('0.00')).toThrow(/maior que zero/);
  });

  it('recusa valor negativo', () => {
    expect(() => parseInitialBalance('-10000')).toThrow(/inválida/);
  });

  it('recusa vírgula como separador decimal', () => {
    // `10000,50` é o jeito de escrever em português, e é o engano mais provável
    // de quem edita o .env. Recusado de propósito: o banco não lê vírgula.
    expect(() => parseInitialBalance('10000,50')).toThrow(/inválida/);
  });

  it('recusa notação exponencial', () => {
    // `1e4` é 10000 em JavaScript e texto sem sentido para a coluna `numeric`.
    expect(() => parseInitialBalance('1e4')).toThrow(/inválida/);
  });

  it('recusa texto', () => {
    expect(() => parseInitialBalance('dez mil')).toThrow(/inválida/);
  });

  it('recusa mais casas decimais do que a coluna guarda', () => {
    // 9 casas: o Postgres arredondaria calado em `numeric(20, 8)`, e o saldo
    // gravado não seria o configurado.
    expect(() => parseInitialBalance('1.000000001')).toThrow(/inválida/);
  });

  it('recusa valor que não cabe na coluna', () => {
    // 13 dígitos inteiros estouram `numeric(20, 8)` — que guarda 12 — e o
    // `INSERT` falharia só na primeira liga criada.
    expect(() => parseInitialBalance('1000000000000')).toThrow(/inválida/);
  });
});
