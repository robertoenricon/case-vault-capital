import { DomainError } from '../common/errors/domain-error.js';

/**
 * Não foi possível obter uma cotação confiável.
 *
 * Um erro só para causas diferentes — rede fora, timeout, rate limit, 5xx da
 * Binance, corpo que não é JSON, preço fora de formato — de propósito: para
 * quem está na tela o resultado é idêntico (não há preço agora) e a ação
 * também (tentar de novo depois). Separar em cinco classes daria cinco
 * mensagens que ninguém trata de forma diferente.
 *
 * A causa real não some: vai no `message`, que é só de log, e a exceção
 * original viaja no `cause`. O cliente lê apenas o `publicMessage` — nome de
 * fornecedor, URL e status de terceiro não saem daqui.
 *
 * É `unavailable`, não `invalid`: quem chamou não fez nada errado. Vira 503.
 */
export class QuotesUnavailableError extends DomainError {
  readonly kind = 'unavailable' as const;
  readonly publicMessage =
    'Não foi possível consultar a cotação agora. Tente novamente em instantes.';

  /**
   * @param detail o que exatamente falhou, para o log. Nunca chega ao cliente.
   */
  constructor(detail: string, options?: { cause?: unknown }) {
    super(`Cotação indisponível: ${detail}`, options);
    this.name = 'QuotesUnavailableError';
  }
}
