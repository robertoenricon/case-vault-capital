import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER } from './password-hasher.js';
import type { PasswordHasher } from './password-hasher.js';
import { UsersRepository } from './users.repository.js';
import type { StoredUser } from './users.repository.js';

/** Entrada da regra, já validada na borda. Texto puro da senha só existe aqui e no hasher. */
export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Cria a conta. Duas garantias ficam aqui porque são regra, não detalhe de
   * transporte nem de banco: o e-mail é a identidade e por isso é normalizado
   * antes de virar chave; e a senha nunca é gravada em texto puro.
   */
  async register(input: RegisterUserInput): Promise<StoredUser> {
    // O UNIQUE do Postgres compara byte a byte. Sem o lowercase aqui,
    // "Ana@Mail.com" e "ana@mail.com" seriam duas contas diferentes.
    const email = input.email.toLowerCase();
    const passwordHash = await this.hasher.hash(input.password);

    return this.users.create({ name: input.name, email, passwordHash });
  }
}
