/**
 * Saldo fictício padrão de uma liga: de onde o valor vem e o que conta como
 * valor aceitável.
 *
 * O valor é configuração de ambiente, não constante de código: trocar o saldo
 * padrão não deve exigir recompilar nem comitar. Quem o consome é a criação de
 * liga, que o copia para a linha da liga — daí em diante a liga tem a própria
 * base e esta configuração não é mais consultada por ela (ver schema.prisma).
 *
 * A conferência mora aqui, separada do módulo, por um motivo: é regra sem
 * dependência nenhuma — sem Nest, sem banco, sem `process.env` — e por isso
 * testável direto (ver initial-balance.spec.ts).
 */

/**
 * Token de injeção. O valor é uma `string`, e string não é classe: sem um
 * símbolo próprio o Nest não teria o que resolver no construtor.
 */
export const LEAGUE_INITIAL_BALANCE = Symbol('LeagueInitialBalance');

/** Nome da variável de ambiente. Aparece nas mensagens de erro, então é uma só. */
const ENV_VAR = 'LEAGUE_INITIAL_BALANCE';

/**
 * Até 12 dígitos inteiros e 8 decimais, com ponto — exatamente o que a coluna
 * `numeric(20, 8)` aceita sem arredondar nem estourar.
 *
 * Conferir a forma aqui é o que transforma "saldo configurado errado" em falha
 * de subida, e não em erro no primeiro `INSERT` de liga. Sem sinal (saldo
 * negativo não existe), sem notação exponencial (`1e4` chegaria ao banco como
 * texto que ele não entende) e sem vírgula (`10000,50` seria lido como outro
 * número, ou recusado, dependendo de quem lê).
 */
const DECIMAL_FORMAT = /^\d{1,12}(\.\d{1,8})?$/;

/** Zero escrito de qualquer forma: `0`, `0.0`, `00.00000000`. */
const ZERO = /^0+(\.0+)?$/;

/**
 * Lê o saldo padrão configurado e devolve o valor **como texto**.
 *
 * Texto, e não `number`: este valor vai direto para uma coluna `numeric` e
 * depois para contas de dinheiro. Converter para `number` aqui colocaria o
 * saldo num ponto flutuante binário na primeira linha do caminho — justamente
 * o que a modelagem decidiu evitar. A string decimal atravessa sem perder nada.
 *
 * Lança, em vez de assumir um padrão, nos três casos de configuração errada:
 * ausente, fora do formato e zero. Saldo é a regra central da liga — subir com
 * um valor chutado faria a plataforma parecer funcionar e distribuir o dinheiro
 * errado, que é pior do que não subir.
 *
 * @param raw o conteúdo da variável de ambiente, ou `undefined` se não existe.
 * Vem de fora de propósito: a função não lê `process.env`, então o teste não
 * precisa mexer no ambiente do processo.
 */
export function parseInitialBalance(raw: string | undefined): string {
  // `trim` porque um espaço sobrando no .env é erro de digitação invisível, não
  // intenção — e passaria pela validação de formato como valor inválido.
  const value = raw?.trim();

  if (!value) {
    throw new Error(
      `${ENV_VAR} não definida. Copie .env.example para .env antes de subir a API.`,
    );
  }

  if (!DECIMAL_FORMAT.test(value)) {
    throw new Error(
      `${ENV_VAR} inválida: "${value}". Use um número positivo com ponto decimal e até 8 casas, por exemplo 10000.`,
    );
  }

  if (ZERO.test(value)) {
    throw new Error(
      `${ENV_VAR} inválida: "${value}". O saldo inicial precisa ser maior que zero — com zero ninguém consegue operar na liga.`,
    );
  }

  return value;
}
