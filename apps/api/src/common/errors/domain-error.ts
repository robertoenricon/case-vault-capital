/**
 * Erro de regra de negócio. O domínio não conhece HTTP: ele diz qual é a
 * natureza do problema (`kind`) e quem traduz para status é o filtro na borda
 * (ver common/filters/domain-exception.filter.ts).
 */

/**
 * Só a natureza que já existe no código. Nova natureza entra quando houver um
 * erro que a use.
 *
 * `unauthorized` = quem está chamando não provou quem é (credencial errada ou
 * ausente).
 *
 * `forbidden` = provou quem é, mas não pode fazer isso — é a autorização por
 * liga: a sessão é válida e ainda assim a pessoa não participa daquela liga.
 * Separado de `unauthorized` porque a saída é diferente: ali, entrar resolve;
 * aqui, entrar de novo não muda nada.
 *
 * `invalid` = o payload está bem formado (passou pelo DTO), mas viola uma regra
 * do domínio — uma liga que começa no passado, por exemplo. Vira 400 e não 422
 * de propósito: o front já trata o 400 do ValidationPipe, e dois status para
 * "seu pedido não serve" só obrigariam a tela a distinguir o que, para quem
 * está nela, é a mesma coisa.
 */
export type DomainErrorKind = 'conflict' | 'unauthorized' | 'forbidden' | 'invalid';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  /**
   * Mensagem segura para devolver ao cliente. Separada de `message` de
   * propósito: `message` pode conter detalhe útil no log, e o que vai para a
   * resposta precisa ser decidido, nunca herdado por acidente.
   */
  abstract readonly publicMessage: string;
}
