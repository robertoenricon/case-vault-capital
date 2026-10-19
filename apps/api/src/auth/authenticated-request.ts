import type { Request } from 'express';

/**
 * Quem está chamando, depois que o `JwtAuthGuard` conferiu o token.
 *
 * Só o id: é o que o token carrega. Nome e e-mail não vêm daqui — quem precisar
 * deles busca no banco, em vez de confiar em dado que viajou no token.
 */
export type AuthenticatedUser = {
  id: string;
};

/**
 * A requisição depois do guard. O `user` é opcional no tipo porque, no tempo do
 * TypeScript, nada garante que o guard rodou: quem lê (o `@CurrentUser()`) é
 * obrigado a tratar a ausência em vez de calar o compilador com `!`.
 */
export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};
