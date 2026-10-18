/**
 * Regras do formulário de criar liga.
 *
 * Espelham o que o backend valida, sem substituí-lo: aqui servem para a pessoa
 * saber do problema antes de esperar a requisição. A palavra final é sempre da
 * API — ela valida de novo e é ela que calcula o período de verdade.
 */

export const LEAGUE_RULES = {
  // `name VarChar(60)` no schema. O mínimo de 3 é decisão de produto: nome de
  // uma ou duas letras não identifica liga nenhuma numa lista.
  name: { minLength: 3, maxLength: 60 },
} as const

export type CreateLeagueFormValues = {
  name: string
  /** `AAAA-MM-DD`, exatamente como o `<input type="date">` entrega. */
  startDate: string
  endDate: string
}

export type CreateLeagueFieldName = keyof CreateLeagueFormValues

export type CreateLeagueFormErrors = {
  [Field in CreateLeagueFieldName]?: string
}

/** O que sai do formulário para a API. O fuso não é digitado: vem do navegador. */
export type CreateLeagueData = {
  name: string
  startDate: string
  endDate: string
  timeZoneOffsetMinutes: number
}

export const EMPTY_CREATE_LEAGUE_VALUES: CreateLeagueFormValues = {
  name: '',
  startDate: '',
  endDate: '',
}

/**
 * Hoje no formato do `<input type="date">`, no fuso de quem está na tela.
 *
 * Usa os getters locais (e não `toISOString`, que converte para UTC): às 21h em
 * São Paulo o UTC já virou o dia seguinte, e o campo mostraria amanhã como
 * mínimo. Serve para o atributo `min` do input e para a validação abaixo.
 */
export function todayAsInputValue(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Fuso de quem está criando, como o backend espera: minutos que, somados ao
 * horário local, dão UTC (São Paulo = 180).
 */
function timeZoneOffsetMinutes(): number {
  return new Date().getTimezoneOffset()
}

export function validateCreateLeagueForm(
  values: CreateLeagueFormValues,
): CreateLeagueFormErrors {
  return {
    name: validateName(values.name.trim()),
    startDate: validateStartDate(values.startDate),
    endDate: validateEndDate(values.endDate, values.startDate),
  }
}

function validateName(name: string): string | undefined {
  const { minLength, maxLength } = LEAGUE_RULES.name

  if (name.length === 0) {
    return 'Dê um nome à liga.'
  }
  if (name.length < minLength) {
    return `O nome precisa de ao menos ${minLength} caracteres.`
  }
  if (name.length > maxLength) {
    return `O nome pode ter no máximo ${maxLength} caracteres.`
  }
  return undefined
}

function validateStartDate(startDate: string): string | undefined {
  if (startDate.length === 0) {
    return 'Escolha o dia de início.'
  }
  // Comparação de texto funciona porque `AAAA-MM-DD` ordena igual ao
  // calendário. Mesma regra do backend, que é quem decide de verdade.
  if (startDate < todayAsInputValue()) {
    return 'A liga não pode começar antes de hoje.'
  }
  return undefined
}

function validateEndDate(
  endDate: string,
  startDate: string,
): string | undefined {
  if (endDate.length === 0) {
    return 'Escolha o dia de fim.'
  }
  // Só compara quando há início válido para comparar: sem isso, um início vazio
  // acusaria erro nos dois campos e esconderia qual deles falta.
  if (startDate.length > 0 && endDate < startDate) {
    return 'O fim não pode ser antes do início.'
  }
  return undefined
}

export function hasErrors(errors: CreateLeagueFormErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

/** Normaliza o que vai para a API e acrescenta o fuso de quem está criando. */
export function toCreateLeagueData(
  values: CreateLeagueFormValues,
): CreateLeagueData {
  return {
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    timeZoneOffsetMinutes: timeZoneOffsetMinutes(),
  }
}
