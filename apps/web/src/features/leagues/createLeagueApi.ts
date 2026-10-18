import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'
import type { CreateLeagueData } from './createLeagueValidation'

/** Liga como a API devolve. As datas chegam em ISO 8601 (UTC); formatar é tarefa da tela. */
export type CreatedLeague = {
  id: string
  name: string
  startsAt: string
  endsAt: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class CreateLeagueRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível criar a liga agora. Tente novamente em instantes.'

/**
 * Confere a forma do que voltou. A resposta chega como `any` do `json()`, e um
 * `as CreatedLeague` só adiaria o erro para a hora de renderizar.
 */
function isCreatedLeague(value: unknown): value is CreatedLeague {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'startsAt' in value &&
    typeof value.startsAt === 'string' &&
    'endsAt' in value &&
    typeof value.endsAt === 'string'
  )
}

/**
 * Cria a liga. O cliente manda nome e os **dias** escolhidos; quem decide os
 * instantes, confere as regras e vincula quem criou é o backend — o token diz
 * quem está criando, então não existe campo de usuário no corpo.
 */
export async function createLeague(
  data: CreateLeagueData,
  accessToken: string,
): Promise<CreatedLeague> {
  let response: Response

  try {
    response = await fetch(apiUrl('/leagues'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })
  } catch (cause) {
    // Falha de rede (API fora do ar, CORS, offline). Nada a dizer sobre a liga,
    // então a mensagem é a genérica e o detalhe fica no `cause`.
    throw new CreateLeagueRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 400 traz a regra que falhou ("A liga não pode começar antes de hoje.") e
    // 401 traz o aviso de sessão; 500 não traz nada útil para quem está na tela.
    const body: unknown = await response.json().catch(() => undefined)
    throw new CreateLeagueRequestError(
      readApiErrorMessage(body) ?? GENERIC_FAILURE,
    )
  }

  const league: unknown = await response.json()

  if (!isCreatedLeague(league)) {
    throw new CreateLeagueRequestError(GENERIC_FAILURE)
  }

  return league
}
