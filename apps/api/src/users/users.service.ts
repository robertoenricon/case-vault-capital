import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER } from './password-hasher.js';
import type { PasswordHasher } from './password-hasher.js';
import { UsersRepository } from './users.repository.js';
import type { PublicUser, StoredUser } from './users.repository.js';

/** Entrada da regra, já validada na borda. Texto puro da senha só existe aqui e no hasher. */
export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
};

/** Identidade pública da conta: o que outros módulos podem saber sobre quem é a pessoa. */
export type UserAccount = {
  id: string;
  name: string;
  email: string;
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

  /**
   * Todas as contas, como podem ser vistas por outra pessoa: id e nome.
   *
   * Existe para o módulo de ligas montar a lista de quem pode ser convidado.
   * Fica aqui, e não lá, porque quem é dono das contas é este módulo: o de
   * ligas pergunta "quem existe?" e recebe o mínimo — nunca alcança o e-mail
   * nem o hash de ninguém.
   */
  async listPublic(): Promise<PublicUser[]> {
    return this.users.findAll();
  }

  /**
   * Confere e-mail e senha. Devolve a identidade da conta, ou `null` se o
   * e-mail não existe **ou** a senha não bate.
   *
   * Mora em `users` e não em `auth` porque quem guarda o hash é este módulo:
   * assim o hash não sai daqui e o módulo de autenticação nem tem como ler um.
   *
   * O retorno não distingue "e-mail inexistente" de "senha errada" de
   * propósito: é o que impede o login de responder diferente nos dois casos e
   * virar uma forma de descobrir quais e-mails têm conta.
   */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserAccount | null> {
    // Mesma normalização do cadastro — foi assim que o e-mail virou chave.
    const credentials = await this.users.findCredentialsByEmail(
      email.toLowerCase(),
    );

    if (!credentials) {
      return null;
    }

    const matches = await this.hasher.compare(
      password,
      credentials.passwordHash,
    );

    if (!matches) {
      return null;
    }

    // O hash para aqui: quem chamou recebe só a identidade.
    return {
      id: credentials.id,
      name: credentials.name,
      email: credentials.email,
    };
  }
}
