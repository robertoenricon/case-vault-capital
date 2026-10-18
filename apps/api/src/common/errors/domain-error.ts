/**
 * Erro de regra de negócio. O domínio não conhece HTTP: ele diz qual é a
 * natureza do problema (`kind`) e quem traduz para status é o filtro na borda
 * (ver common/filters/domain-exception.filter.ts).
 */

/** Só a natureza que já existe no código. Nova natureza entra quando houver um erro que a use. */
export type DomainErrorKind = 'conflict';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  /**
   * Mensagem segura para devolver ao cliente. Separada de `message` de
   * propósito: `message` pode conter detalhe útil no log, e o que vai para a
   * resposta precisa ser decidido, nunca herdado por acidente.
   */
  abstract readonly publicMessage: string;
}
