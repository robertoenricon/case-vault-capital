import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'
import type { RegisterData } from './registerValidation'

/** O que a API devolve ao criar a conta. Nada de senha, nem de hash. */
export type RegisteredUser = {
  id: string
  name: string
  email: string
}

/**
 * Erro já pronto para a tela: a mensagem foi decidida aqui, uma única vez, e o
 * componente só exibe. Evita cada tela inventar seu próprio texto para o mesmo
 * status HTTP.
 */
export class RegisterRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível criar sua conta agora. Tente novamente em instantes.'

/**
 * A resposta chega como `any` do `json()`. Conferir a forma aqui é o que
 * permite o resto do front trabalhar com `RegisteredUser` de verdade, sem um
 * `as` prometendo algo que ninguém verificou.
 */
function isRegisteredUser(value: unknown): value is RegisteredUser {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string'
  )
}

/**
 * Cria a conta. O que o cliente manda é só nome, e-mail e senha — normalização,
 * unicidade e hash são decisão do backend.
 */
export async function registerUser(
  data: RegisterData,
): Promise<RegisteredUser> {
  let response: Response

  try {
    response = await fetch(apiUrl('/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (cause) {
    // Falha de rede (API fora do ar, CORS, offline): nada a dizer sobre a
    // conta, então a mensagem é a genérica e o detalhe fica no `cause`.
    throw new RegisterRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 409 (e-mail em uso) e 400 (validação) trazem texto próprio do backend;
    // 500 não traz nada útil para quem está na tela.
    const body: unknown = await response.json().catch(() => undefined)
    throw new RegisterRequestError(readApiErrorMessage(body) ?? GENERIC_FAILURE)
  }

  const created: unknown = await response.json()

  if (!isRegisteredUser(created)) {
    throw new RegisterRequestError(GENERIC_FAILURE)
  }

  return created
}
