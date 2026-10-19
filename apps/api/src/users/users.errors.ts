import { DomainError } from '../common/errors/domain-error.js';

/**
 * Já existe uma conta com esse e-mail.
 *
 * Decisão de produto: a resposta é explícita ("este e-mail já está em uso") em
 * vez de genérica. Numa liga entre amigos, deixar a pessoa descobrir que já tem
 * conta vale mais do que esconder quais e-mails existem na base.
 */
export class EmailAlreadyInUseError extends DomainError {
  readonly kind = 'conflict' as const;
  readonly publicMessage = 'Este e-mail já está em uso.';

  constructor(email: string) {
    // Vai para o log, não para a resposta: ajuda a investigar sem decidir o
    // que o cliente enxerga.
    super(`Tentativa de cadastro com e-mail já existente: ${email}`);
    this.name = 'EmailAlreadyInUseError';
  }
}
