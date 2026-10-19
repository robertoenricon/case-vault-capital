/**
 * Regras do formulário de cadastro
 */

export const REGISTER_RULES = {
  // `name VarChar(120)` no schema.
  name: { minLength: 2, maxLength: 120 },

  // `email VarChar(255)` no schema.
  email: { maxLength: 255 },

  // Mínimo de 8 é decisão de produto. O teto de 72 não vem do schema: vem do bcrypt,
  // que ignora o que passa de 72 bytes — aceitar mais seria truncar em silêncio.
  password: { minLength: 8, maxLength: 72 },
} as const

/**
 * Verifica se o e-mail tem formato válido.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type RegisterFormValues = {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}

export type RegisterFieldName = keyof RegisterFormValues

export type RegisterFormErrors = {
  [Field in RegisterFieldName]?: string
}

/** O que sai do formulário para quem for enviar à API. A confirmação não vai: é só UI. */
export type RegisterData = {
  name: string
  email: string
  password: string
}

export const EMPTY_REGISTER_VALUES: RegisterFormValues = {
  name: '',
  email: '',
  password: '',
  passwordConfirmation: '',
}

/**
 * Valida os valores do formulário de cadastro e retorna os erros encontrados.
 */
export function validateRegisterForm(
  values: RegisterFormValues,
): RegisterFormErrors {
  return {
    name: validateName(values.name.trim()),
    email: validateEmail(values.email.trim()),
    password: validatePassword(values.password),
    passwordConfirmation: validatePasswordConfirmation(
      values.passwordConfirmation,
      values.password,
    ),
  }
}

/*
 * Valida o nome do usuário.
 */
function validateName(name: string): string | undefined {
  const { minLength, maxLength } = REGISTER_RULES.name

  if (name.length === 0) {
    return 'Informe seu nome.'
  }
  if (name.length < minLength) {
    return `O nome precisa de ao menos ${minLength} caracteres.`
  }
  if (name.length > maxLength) {
    return `O nome pode ter no máximo ${maxLength} caracteres.`
  }
  return undefined
}

/**
 * Valida o e-mail do usuário.
 */
function validateEmail(email: string): string | undefined {
  const { maxLength } = REGISTER_RULES.email

  if (email.length === 0) {
    return 'Informe seu e-mail.'
  }
  if (email.length > maxLength) {
    return `O e-mail pode ter no máximo ${maxLength} caracteres.`
  }
  if (!EMAIL_PATTERN.test(email)) {
    return 'E-mail inválido. Confira o formato: voce@exemplo.com'
  }
  return undefined
}
/**
 * Valida a senha do usuário.
 */
function validatePassword(password: string): string | undefined {
  const { minLength, maxLength } = REGISTER_RULES.password

  if (password.length === 0) {
    return 'Crie uma senha.'
  }
  if (password.length < minLength) {
    return `A senha precisa de ao menos ${minLength} caracteres.`
  }
  if (password.length > maxLength) {
    return `A senha pode ter no máximo ${maxLength} caracteres.`
  }
  return undefined
}

/**
 * Valida a confirmação da senha do usuário.
 */
function validatePasswordConfirmation(
  confirmation: string,
  password: string,
): string | undefined {
  if (confirmation.length === 0) {
    return 'Repita a senha.'
  }
  if (confirmation !== password) {
    return 'As senhas não conferem.'
  }
  return undefined
}

/**
 * Verifica se há algum erro no formulário de cadastro.
 */
export function hasErrors(errors: RegisterFormErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

/**
 * Normaliza o que vai para a API.
 */
export function toRegisterData(values: RegisterFormValues): RegisterData {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
  }
}
