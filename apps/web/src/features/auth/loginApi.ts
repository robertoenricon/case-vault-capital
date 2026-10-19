import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'
import { isSession } from './session'
import type { Session } from './session'

export type LoginCredentials = {
  email: string
  password: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class LoginRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível entrar agora. Tente novamente em instantes.'

/**
 * Faz login. O cliente manda e-mail e senha; quem confere, normaliza e decide é
 * o backend — o front não sabe nem como a senha é guardada.
 */
export async function login(credentials: LoginCredentials): Promise<Session> {
  let response: Response

  try {
    response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
  } catch (cause) {
    // Falha de rede (API fora do ar, CORS, offline). Nada a dizer sobre a
    // credencial, então a mensagem é a genérica e o detalhe fica no `cause`.
    throw new LoginRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 401 traz "E-mail ou senha incorretos." e 400 traz o erro de formato;
    // 500 não traz nada útil para quem está na tela.
    const body: unknown = await response.json().catch(() => undefined)
    throw new LoginRequestError(readApiErrorMessage(body) ?? GENERIC_FAILURE)
  }

  const session: unknown = await response.json()

  // A resposta chega como `any` do `json()`: conferir a forma é o que permite o
  // resto do front trabalhar com `Session` de verdade.
  if (!isSession(session)) {
    throw new LoginRequestError(GENERIC_FAILURE)
  }

  return session
}
