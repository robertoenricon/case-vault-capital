import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * Contrato de entrada da criação de liga. Valida **formato**; o que é regra de
 * negócio (não começar no passado, fim depois do início) fica no domínio, em
 * league-period.ts.
 *
 * Quem cria a liga não vem daqui: vem do token, pelo `@CurrentUser()`. Um
 * campo `userId` no corpo seria aceitar do cliente a resposta de quem ele é.
 */

/** `AAAA-MM-DD`, que é exatamente o que o `<input type="date">` produz. */
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fuso válido vai de UTC-14 a UTC+14 em minutos. Não é regra de negócio: é a
 * faixa que existe no mundo, e serve para um número absurdo não chegar à conta
 * que transforma dia em instante.
 */
const MAX_OFFSET_MINUTES = 14 * 60;

/** Mesmo trim do cadastro: "  Liga  " é a mesma liga que "Liga". */
function TrimString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/**
 * Garante que o `@Matches` receba uma string: `{ "startDate": 123 }` no corpo
 * vira `''` e cai na mensagem de formato, em vez de depender de como a lib de
 * validação reage a um tipo inesperado.
 */
function AsDayString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : '',
  );
}

export class CreateLeagueDto {
  // 60 = `name VarChar(60)` na tabela leagues. Mínimo de 3 é decisão de
  // produto: nome de uma letra não identifica liga nenhuma no ranking.
  @IsString({ message: 'Dê um nome à liga.' })
  @Length(3, 60, { message: 'O nome da liga precisa ter de 3 a 60 caracteres.' })
  @TrimString()
  name: string;

  @Matches(DAY_FORMAT, { message: 'Informe a data de início da liga.' })
  @AsDayString()
  startDate: string;

  @Matches(DAY_FORMAT, { message: 'Informe a data de fim da liga.' })
  @AsDayString()
  endDate: string;

  // `Date#getTimezoneOffset()` do navegador. Sem ele o servidor teria que
  // adivinhar em que fuso "o dia 20/10" começa — ver league-period.ts.
  @IsInt({ message: 'Fuso horário inválido.' })
  @Min(-MAX_OFFSET_MINUTES, { message: 'Fuso horário inválido.' })
  @Max(MAX_OFFSET_MINUTES, { message: 'Fuso horário inválido.' })
  timeZoneOffsetMinutes: number;
}
