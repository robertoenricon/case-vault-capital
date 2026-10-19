/**
 * Contrato de emissão do token de acesso, declarado pelo módulo que consome
 * (auth) e não pelo que implementa: a regra de login depende desta interface, e
 * a lib de JWT depende dela também. Trocar @nestjs/jwt por outra lib — ou pela
 * sessão em cookie, se um dia a decisão mudar — não toca no serviço de login.
 *
 * É também o que permite testar a regra sem segredo, sem lib e sem decodificar
 * token nenhum: o teste injeta um emissor falso e verifica o que foi assinado.
 *
 * Interface enxuta de propósito: o login só precisa emitir. A verificação
 * nasceu com a primeira rota protegida e foi para um contrato próprio
 * (access-token-verifier.ts), em vez de virar um segundo método aqui — assim
 * nenhum dos dois consumidores carrega método que não usa.
 */

/**
 * Conteúdo do token. `sub` (subject) é o id da conta — nome padrão do JWT, e o
 * que o guard vai ler quando existir.
 *
 * Qualquer pessoa com o token lê o payload: ele é assinado, não criptografado.
 * Por isso aqui vai só o id, nada de e-mail, nome ou papel.
 */
export type AccessTokenPayload = {
  sub: string;
};

export interface AccessTokenIssuer {
  issue(payload: AccessTokenPayload): Promise<string>;
}

/** Token de injeção: interface não existe em runtime, então o Nest precisa de um símbolo. */
export const ACCESS_TOKEN_ISSUER = Symbol('AccessTokenIssuer');
