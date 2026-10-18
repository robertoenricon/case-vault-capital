import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-request.js';

/**
 * Entrega ao controller quem está chamando, já conferido pelo `JwtAuthGuard`.
 *
 * Existe para o controller não ter que mexer em `Request` — ele continua sem
 * saber que identidade viaja em header. E tipado: o parâmetro é
 * `AuthenticatedUser`, não `any` saído de `request.user`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      // Só acontece se alguém usar `@CurrentUser()` numa rota sem o
      // `JwtAuthGuard`. É erro de programação, não do cliente: estourar aqui
      // vira 500 no filtro padrão do Nest e aparece no primeiro teste da rota.
      // A alternativa seria um `!` calando o compilador e uma rota que trata
      // usuário inexistente como anônimo.
      throw new Error(
        'CurrentUser usado em rota sem JwtAuthGuard: a requisição não tem identidade.',
      );
    }

    return request.user;
  },
);
