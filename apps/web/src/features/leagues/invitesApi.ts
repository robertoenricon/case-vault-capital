import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'
import { isLeague, isLeagueStatus } from './leaguesApi'
import type { League, LeagueStatus } from './leaguesApi'

/**
 * Convite pendente, como a API o devolve.
 *
 * Não tem o id da liga: quem foi convidado ainda não participa dela, e o id só
 * serviria para tentar rotas que o backend vai recusar. O que a tela mostra é
 * o nome, o período e a situação.
 */
export type PendingInvite = {
  id: string
  leagueName: string
  /** ISO 8601 em UTC, como na liga. Formatar é tarefa da tela. */
  startsAt: string
  endsAt: string
  status: LeagueStatus
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class InvitesRequestError extends Error {}

const LIST_FAILURE =
  'Não foi possível carregar seus convites agora. Tente novamente em instantes.'

const RESPOND_FAILURE =
  'Não foi possível responder ao convite agora. Tente novamente em instantes.'

const SEND_FAILURE =
  'Não foi possível enviar o convite agora. Tente novamente em instantes.'

/**
 * Confere a forma do que voltou. A situação usa a mesma função da liga
 * (`isLeagueStatus`), importada de lá: a lista de situações que a tela sabe
 * desenhar é um conhecimento só, e duplicá-la aqui deixaria as duas divergirem.
 */
function isPendingInvite(value: unknown): value is PendingInvite {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'leagueName' in value &&
    typeof value.leagueName === 'string' &&
    'startsAt' in value &&
    typeof value.startsAt === 'string' &&
    'endsAt' in value &&
    typeof value.endsAt === 'string' &&
    'status' in value &&
    isLeagueStatus(value.status)
  )
}

/** Cabeçalho de sessão. As três rotas de convite são protegidas. */
function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` }
}

/**
 * Convites pendentes de quem está logado. Não existe parâmetro de usuário:
 * quem manda é o token.
 *
 * O `signal` é obrigatório, não opcional, para que nenhuma chamada nasça sem
 * cancelamento.
 */
export async function listPendingInvites(
  accessToken: string,
  signal: AbortSignal,
): Promise<PendingInvite[]> {
  let response: Response

  try {
    response = await fetch(apiUrl('/leagues/invites'), {
      headers: authHeaders(accessToken),
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new InvitesRequestError(LIST_FAILURE, { cause })
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    throw new InvitesRequestError(readApiErrorMessage(body) ?? LIST_FAILURE)
  }

  const invites: unknown = await response.json()

  if (!Array.isArray(invites) || !invites.every(isPendingInvite)) {
    throw new InvitesRequestError(LIST_FAILURE)
  }

  return invites
}

/**
 * Aceita o convite. Devolve a liga em que a pessoa acabou de entrar — é a
 * mesma forma da listagem, então a tela não precisa de um tipo especial.
 */
export async function acceptInvite(
  inviteId: string,
  accessToken: string,
): Promise<League> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/invites/${inviteId}/accept`), {
      method: 'POST',
      headers: authHeaders(accessToken),
    })
  } catch (cause) {
    throw new InvitesRequestError(RESPOND_FAILURE, { cause })
  }

  if (!response.ok) {
    // 400 traz "Esta liga já encerrou."; 403, o convite que não está mais lá.
    const body: unknown = await response.json().catch(() => undefined)
    throw new InvitesRequestError(readApiErrorMessage(body) ?? RESPOND_FAILURE)
  }

  const league: unknown = await response.json()

  if (!isLeague(league)) {
    throw new InvitesRequestError(RESPOND_FAILURE)
  }

  return league
}

/** Recusa o convite. A API responde 204: não há corpo para ler. */
export async function rejectInvite(
  inviteId: string,
  accessToken: string,
): Promise<void> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/invites/${inviteId}/reject`), {
      method: 'POST',
      headers: authHeaders(accessToken),
    })
  } catch (cause) {
    throw new InvitesRequestError(RESPOND_FAILURE, { cause })
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    throw new InvitesRequestError(readApiErrorMessage(body) ?? RESPOND_FAILURE)
  }
}

/**
 * Convida alguém para a liga. O corpo diz só quem está sendo convidado: a liga
 * vem do caminho e quem convida vem do token.
 *
 * A API responde 204 — o convite não tem URL para o cliente buscar depois, e
 * quem vai lê-lo é quem o recebeu.
 */
export async function inviteToLeague(
  leagueId: string,
  userId: string,
  accessToken: string,
): Promise<void> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/${leagueId}/invites`), {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })
  } catch (cause) {
    throw new InvitesRequestError(SEND_FAILURE, { cause })
  }

  if (!response.ok) {
    // 409 traz "Esta pessoa já tem um convite pendente."; 400, a liga encerrada.
    const body: unknown = await response.json().catch(() => undefined)
    throw new InvitesRequestError(readApiErrorMessage(body) ?? SEND_FAILURE)
  }
}
