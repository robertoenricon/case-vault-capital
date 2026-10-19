import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../errors/domain-error.js';
import type { DomainErrorKind } from '../errors/domain-error.js';

/** Único lugar que converte natureza de erro de domínio em status HTTP. */
const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  conflict: HttpStatus.CONFLICT,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  invalid: HttpStatus.BAD_REQUEST,
  // 503 e não 500: o 500 diria que **a nossa** aplicação quebrou. Aqui ela
  // funcionou e quem não respondeu foi um serviço de fora — e a diferença
  // importa para quem monitora, não só para quem está na tela.
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/**
 * Captura só `DomainError`. O que não for regra de negócio continua caindo no
 * filtro padrão do Nest, que responde 500 genérico — nenhuma stack trace, nem
 * mensagem de ORM, chega ao cliente.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[exception.kind];

    response.status(status).json({
      statusCode: status,
      message: exception.publicMessage,
      error: exception.name,
    });
  }
}
