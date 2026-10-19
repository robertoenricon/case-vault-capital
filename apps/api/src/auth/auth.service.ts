import { Inject, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import type { UserAccount } from '../users/users.service.js';
import { ACCESS_TOKEN_ISSUER } from './access-token-issuer.js';
import type { AccessTokenIssuer } from './access-token-issuer.js';
import { InvalidCredentialsError } from './auth.errors.js';

/** Entrada da regra, já validada na borda. */
export type LoginInput = {
  email: string;
  password: string;
};

/** Token para as próximas requisições + quem entrou, para o front saudar sem decodificar o token. */
export type LoginResult = {
  accessToken: string;
  user: UserAccount;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly tokens: AccessTokenIssuer,
  ) {}

  /**
   * Autentica e emite a sessão. A conferência da senha é delegada ao módulo
   * `users`, que é quem guarda o hash: daqui não dá para ver hash nenhum.
   *
   * Este serviço decide duas coisas, e só elas: credencial inválida não entra, e
   * quem entra recebe um token com o id da conta.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.verifyCredentials(
      input.email,
      input.password,
    );

    // E-mail inexistente e senha errada caem no mesmo erro, de propósito
    // (ver auth.errors.ts). Aqui não há como responder diferente nos dois
    // casos nem por acidente: `verifyCredentials` devolve `null` nos dois.
    if (!user) {
      throw new InvalidCredentialsError(input.email);
    }

    const accessToken = await this.tokens.issue({ sub: user.id });

    return { accessToken, user };
  }
}
