/**
 * Contrato de hash de senha, declarado pelo módulo que consome (users) e não
 * pelo que implementa: o service de cadastro depende desta interface, e a lib
 * de hash depende dela também. Trocar bcrypt por outra lib não toca na regra.
 *
 * Interface enxuta de propósito: o cadastro só precisa gerar hash. O `compare`
 * entra quando existir login, não antes.
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
}

/** Token de injeção: interface não existe em runtime, então o Nest precisa de um símbolo. */
export const PASSWORD_HASHER = Symbol('PasswordHasher');
