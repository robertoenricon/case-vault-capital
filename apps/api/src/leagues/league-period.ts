import {
  LeagueEndsBeforeStartError,
  LeagueStartsInPastError,
  MalformedLeagueDateError,
} from './leagues.errors.js';

/**
 * Regra do período da liga: transforma o **dia** que a pessoa escolheu no
 * formulário nos dois **instantes** que delimitam a disputa, e recusa período
 * que não faz sentido.
 *
 * Por que o cliente manda dia e não instante: o formulário tem campo de data,
 * sem hora. Deixar o navegador calcular o instante e enviá-lo pronto colocaria
 * no cliente a decisão de quando a liga começa — e o servidor não teria como
 * conferir a regra "não pode começar no passado", porque 00:00 de hoje já é
 * passado quando é meio-dia. Então o cliente diz *qual dia* e o servidor diz
 * *qual instante*, com o fuso de quem está criando.
 *
 * Convenção escolhida: a liga vale o dia inteiro — começa 00:00 do dia de
 * início e termina 23:59:59.999 do dia de fim, no fuso de quem criou.
 *
 * Arquivo sem Nest, sem Prisma e sem HTTP de propósito: é a regra, e dá para
 * testá-la com uma chamada de função.
 */

/** Dia do calendário como vem do `<input type="date">`: sem hora e sem fuso. */
type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

export type LeaguePeriodInput = {
  /** Dia de início no formato `AAAA-MM-DD`. */
  startDate: string;
  /** Dia de fim no formato `AAAA-MM-DD`. */
  endDate: string;
  /**
   * Fuso de quem está criando, como `Date#getTimezoneOffset()` do navegador:
   * minutos que, somados ao horário local, resultam em UTC (São Paulo = 180).
   *
   * Chega já com a faixa validada pelo DTO. É informação de localidade, não
   * credencial: aceitar do cliente aqui é como aceitar o idioma da interface.
   */
  timeZoneOffsetMinutes: number;
};

export type LeaguePeriod = {
  startsAt: Date;
  endsAt: Date;
};

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE_IN_MS = 60_000;

/**
 * Monta o período da liga a partir dos dias escolhidos.
 *
 * `now` entra como parâmetro em vez de `new Date()` lá dentro: é o que permite
 * testar a virada do dia sem depender da hora em que o teste roda.
 *
 * @throws MalformedLeagueDateError dia que não existe no calendário
 * @throws LeagueStartsInPastError  início antes de hoje, no fuso de quem cria
 * @throws LeagueEndsBeforeStartError fim antes do início
 */
export function buildLeaguePeriod(
  input: LeaguePeriodInput,
  now: Date,
): LeaguePeriod {
  const offset = input.timeZoneOffsetMinutes;

  const start = parseCalendarDay(input.startDate);
  const end = parseCalendarDay(input.endDate);

  // "Hoje" é o dia de quem está criando, não o do servidor: às 22h em São Paulo
  // o servidor em UTC já está no dia seguinte, e a liga marcada para amanhã
  // seria recusada como passado.
  const today = dayOf(now, offset);

  if (compareDays(start, today) < 0) {
    throw new LeagueStartsInPastError(input.startDate, formatDay(today));
  }

  // Comparação por dia, e não pelos instantes: fim igual ao início é a liga de
  // um dia, e nos instantes 23:59 é maior que 00:00 de qualquer forma.
  if (compareDays(end, start) < 0) {
    throw new LeagueEndsBeforeStartError(input.startDate, input.endDate);
  }

  return {
    startsAt: startOfDay(start, offset),
    endsAt: endOfDay(end, offset),
  };
}

/**
 * Lê `AAAA-MM-DD`. Recusa o que não tem esse formato e também o que tem o
 * formato mas não existe — `2026-02-31` casa com o padrão.
 */
function parseCalendarDay(value: string): CalendarDay {
  const match = DAY_PATTERN.exec(value);

  if (!match) {
    throw new MalformedLeagueDateError(value);
  }

  const candidate: CalendarDay = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  // O `Date` normaliza silenciosamente o que não existe: 31/02 vira 03/03. Se o
  // que volta não é o que entrou, o dia não existe no calendário.
  const normalized = new Date(
    Date.UTC(candidate.year, candidate.month - 1, candidate.day),
  );

  const survived =
    normalized.getUTCFullYear() === candidate.year &&
    normalized.getUTCMonth() === candidate.month - 1 &&
    normalized.getUTCDate() === candidate.day;

  if (!survived) {
    throw new MalformedLeagueDateError(value);
  }

  return candidate;
}

/** Instante em que o dia começa (00:00) para quem está no fuso informado. */
function startOfDay(day: CalendarDay, offsetMinutes: number): Date {
  return new Date(
    Date.UTC(day.year, day.month - 1, day.day, 0, 0, 0, 0) +
      offsetMinutes * MINUTE_IN_MS,
  );
}

/**
 * Último instante do dia (23:59:59.999) no mesmo fuso.
 *
 * Fecha em 23:59:59.999 e não em 00:00 do dia seguinte para que o fim gravado
 * seja um instante **dentro** do dia escolhido: quem ler "termina em 25/10" no
 * banco vê 25/10, não 26/10.
 */
function endOfDay(day: CalendarDay, offsetMinutes: number): Date {
  return new Date(
    Date.UTC(day.year, day.month - 1, day.day, 23, 59, 59, 999) +
      offsetMinutes * MINUTE_IN_MS,
  );
}

/** Em que dia do calendário este instante cai, para quem está no fuso informado. */
function dayOf(instant: Date, offsetMinutes: number): CalendarDay {
  // Desloca o instante para o horário local e depois lê as partes em UTC: é o
  // jeito de ler "o dia de outro fuso" sem depender do fuso do servidor.
  const local = new Date(instant.getTime() - offsetMinutes * MINUTE_IN_MS);

  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
  };
}

/** Ordem cronológica entre dois dias: negativo, zero ou positivo. */
function compareDays(a: CalendarDay, b: CalendarDay): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** `AAAA-MM-DD` de volta, só para a mensagem de log do erro. */
function formatDay(day: CalendarDay): string {
  const month = String(day.month).padStart(2, '0');
  const dayOfMonth = String(day.day).padStart(2, '0');

  return `${day.year}-${month}-${dayOfMonth}`;
}
