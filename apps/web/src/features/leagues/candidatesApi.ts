import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Pessoa que pode ser convidada para uma liga.
 *
 * Só id e nome: a API não devolve e-mail de terceiro, por decisão registrada.
 * A consequência está assumida — dois cadastros com o mesmo nome ficam
 * indistinguíveis nesta lista.
 */
export type LeagueCandidate = {
  id: string
  name: string
  /** `true` quando a pessoa já está na liga: a tela mostra isso no lugar do convite. */
  alreadyParticipant: boolean
  /**
   * `true` quando já existe convite pendente para ela nesta liga.
   *
   * Vem da API, e não de um estado local do modal: quem sabe quais convites
   * existem é o backend, e a marca precisa continuar certa depois de fechar e
   * reabrir o modal.
   */
  invitePending: boolean
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class CandidatesRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível carregar as pessoas agora. Tente novamente em instantes.'

function isLeagueCandidate(value: unknown): value is LeagueCandidate {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'alreadyParticipant' in value &&
    typeof value.alreadyParticipant === 'boolean' &&
    'invitePending' in value &&
    typeof value.invitePending === 'boolean'
  )
}

/**
 * Pessoas que podem ser convidadas para uma liga.
 *
 * A rota é no escopo da liga porque a resposta depende dela: é a liga que diz
 * quem já está dentro. Quem não participa recebe 403 — e a mesma resposta vale
 * para liga que não existe, então não há como descobrir liga alheia por id.
 *
 * O `signal` é obrigatório, não opcional, para que nenhuma chamada nasça sem
 * cancelamento: abrir e fechar o modal rápido deixaria uma resposta velha
 * chegando depois.
 */
export async function listLeagueCandidates(
  leagueId: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<LeagueCandidate[]> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/${leagueId}/candidates`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new CandidatesRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 403 traz "Você não participa desta liga."; 401, o aviso de sessão.
    const body: unknown = await response.json().catch(() => undefined)
    throw new CandidatesRequestError(
      readApiErrorMessage(body) ?? GENERIC_FAILURE,
    )
  }

  const candidates: unknown = await response.json()

  if (!Array.isArray(candidates) || !candidates.every(isLeagueCandidate)) {
    throw new CandidatesRequestError(GENERIC_FAILURE)
  }

  return candidates
}
