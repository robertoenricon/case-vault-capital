import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'
import { isLeague } from './leaguesApi'
import type { League } from './leaguesApi'
import type { CreateLeagueData } from './createLeagueValidation'

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class CreateLeagueRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível criar a liga agora. Tente novamente em instantes.'

/**
 * Cria a liga. O cliente manda nome e os **dias** escolhidos; quem decide os
 * instantes, confere as regras e vincula quem criou é o backend — o token diz
 * quem está criando, então não existe campo de usuário no corpo.
 *
 * A resposta tem a mesma forma da listagem (`League`, situação incluída), então
 * a tela não precisa de um tipo especial para "liga recém-criada".
 */
export async function createLeague(
  data: CreateLeagueData,
  accessToken: string,
): Promise<League> {
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

  // Mesma conferência de forma da listagem: a função mora em leaguesApi.ts
  // porque a forma da liga é um conhecimento só.
  if (!isLeague(league)) {
    throw new CreateLeagueRequestError(GENERIC_FAILURE)
  }

  return league
}
