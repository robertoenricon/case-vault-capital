import { DomainError } from '../common/errors/domain-error.js';

/**
 * Data que casa com o formato `AAAA-MM-DD` mas não existe no calendário —
 * `2026-02-31`, por exemplo.
 *
 * O DTO confere o formato; a existência do dia é conferida junto da regra, que
 * é quem sabe transformar dia em instante. Dois lugares, duas perguntas
 * diferentes: "parece uma data?" e "é uma data?".
 */
export class MalformedLeagueDateError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage = 'Data inválida. Confira o dia escolhido.';

  constructor(value: string) {
    super(`Data de liga inexistente no calendário: ${value}`);
    this.name = 'MalformedLeagueDateError';
  }
}

/**
 * Liga com início antes de hoje.
 *
 * Decisão de produto: bloquear. Apurar o que aconteceu antes de a liga existir
 * exigiria preço histórico das criptos, e a cotação que o produto usa é a
 * atual. Preço assumido: não dá para registrar uma liga que começou ontem.
 *
 * "Hoje" é o dia de quem está criando, não o do servidor (ver league-period.ts).
 */
export class LeagueStartsInPastError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage = 'A liga não pode começar antes de hoje.';

  constructor(startDate: string, today: string) {
    super(`Início de liga no passado: ${startDate} (hoje, para quem criou: ${today})`);
    this.name = 'LeagueStartsInPastError';
  }
}

/**
 * Fim antes do início.
 *
 * Fim **igual** ao início é válido: é a liga de um dia, que começa 00:00 e
 * termina 23:59 do mesmo dia. Como não há duração mínima, não há por que
 * proibir a mais curta.
 */
export class LeagueEndsBeforeStartError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage = 'O fim da liga não pode ser antes do início.';

  constructor(startDate: string, endDate: string) {
    super(`Período de liga invertido: início ${startDate}, fim ${endDate}`);
    this.name = 'LeagueEndsBeforeStartError';
  }
}
