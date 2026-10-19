import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_VERIFIER } from './access-token-verifier.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';
import {
  InvalidAccessTokenError,
  MissingAccessTokenError,
} from './auth.errors.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Porteiro das rotas protegidas: confere o token e coloca na requisição **quem**
 * está chamando. É a única fonte de identidade da aplicação — nenhuma rota lê
 * `userId` do corpo ou da query, porque isso seria aceitar do cliente a
 * resposta de "quem sou eu".
 *
 * Não é global: cada rota declara `@UseGuards(JwtAuthGuard)`. Um guard global
 * tornaria pública por omissão qualquer rota com exceção mal configurada, e o
 * cadastro e o login precisam ser públicos. Em troca, rota nova sem guard é
 * decisão de quem escreveu — e tem que estar escrita.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokens: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenFrom(request.headers.authorization);

    if (!token) {
      throw new MissingAccessTokenError(request.method, request.path);
    }

    const payload = await this.tokens.verify(token);

    if (!payload) {
      throw new InvalidAccessTokenError(request.method, request.path);
    }

    // Daqui para frente, `request.user` é a identidade confiável da requisição.
    // Quem lê é o `@CurrentUser()`, nunca o controller na mão.
    request.user = { id: payload.sub };

    return true;
  }
}

/**
 * Extrai o token do header `Authorization`.
 *
 * `undefined` quando o header falta, não é Bearer ou é "Bearer " sem nada
 * depois — os três casos significam a mesma coisa para quem chamou.
 */
function bearerTokenFrom(header: string | undefined): string | undefined {
  if (!header?.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : undefined;
}
