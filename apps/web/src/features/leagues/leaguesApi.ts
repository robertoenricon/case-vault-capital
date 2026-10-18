import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Situações que esta versão da tela sabe desenhar. O tipo sai da lista, e não o
 * contrário, para que a checagem de runtime e o tipo não possam divergir: quem
 * acrescentar uma situação aqui atualiza os dois de uma vez.
 */
const STATUSES = ['scheduled', 'running', 'finished'] as const

/**
 * Situação da liga, **decidida pelo backend**. O front não compara datas para
 * descobrir se a liga está valendo: recebe o código e escolhe a palavra que
 * aparece na tela (ver LeagueCard.tsx).
 */
export type LeagueStatus = (typeof STATUSES)[number]

/** Liga como a API devolve, tanto na criação quanto na listagem. */
export type League = {
  id: string
  name: string
  /** ISO 8601 em UTC. Formatar para o fuso de quem lê é tarefa da tela. */
  startsAt: string
  endsAt: string
  status: LeagueStatus
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class LeaguesRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível carregar suas ligas agora. Tente novamente em instantes.'

/**
 * Confere a forma do que voltou. A resposta chega como `any` do `json()`, e um
 * `as League` só adiaria o erro para a hora de renderizar.
 *
 * A situação é conferida contra a lista de valores conhecidos: um `status` novo
 * na API (uma liga "cancelada", por exemplo) não deve entrar como se a tela
 * soubesse desenhá-lo.
 */
function isLeagueStatus(value: unknown): value is LeagueStatus {
  return STATUSES.some((status) => status === value)
}

export function isLeague(value: unknown): value is League {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'startsAt' in value &&
    typeof value.startsAt === 'string' &&
    'endsAt' in value &&
    typeof value.endsAt === 'string' &&
    'status' in value &&
    isLeagueStatus(value.status)
  )
}

/**
 * Ligas de quem está logado. Não existe parâmetro de usuário: quem manda é o
 * token, e o backend monta a lista de quem o apresentou.
 *
 * O `signal` é obrigatório, não opcional, para que nenhuma chamada nasça sem
 * cancelamento: resposta lenta de uma busca antiga sobrescreveria a nova.
 */
export async function listLeagues(
  accessToken: string,
  signal: AbortSignal,
): Promise<League[]> {
  let response: Response

  try {
    response = await fetch(apiUrl('/leagues'), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new LeaguesRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 401 traz o aviso de sessão expirada; 500 não traz nada útil para a tela.
    const body: unknown = await response.json().catch(() => undefined)
    throw new LeaguesRequestError(readApiErrorMessage(body) ?? GENERIC_FAILURE)
  }

  const leagues: unknown = await response.json()

  if (!Array.isArray(leagues) || !leagues.every(isLeague)) {
    throw new LeaguesRequestError(GENERIC_FAILURE)
  }

  return leagues
}
