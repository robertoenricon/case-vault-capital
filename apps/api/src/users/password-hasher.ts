/**
 * Contrato de hash de senha, declarado pelo módulo que consome (users) e não
 * pelo que implementa: o service de cadastro depende desta interface, e a lib
 * de hash depende dela também. Trocar bcrypt por outra lib não toca na regra.
 *
 * Interface enxuta de propósito: só o que existe consumidor para chamar. O
 * `compare` entrou agora, junto do login — não foi criado "por garantia".
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;

  /**
   * `true` quando a senha em texto puro corresponde ao hash guardado.
   *
   * Devolve booleano em vez de lançar: senha errada é resposta esperada da
   * conferência, não falha excepcional. Quem decide o que fazer com o `false` é
   * quem chamou.
   */
  compare(plainPassword: string, passwordHash: string): Promise<boolean>;
}

/** Token de injeção: interface não existe em runtime, então o Nest precisa de um símbolo. */
export const PASSWORD_HASHER = Symbol('PasswordHasher');
