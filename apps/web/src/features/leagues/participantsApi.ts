import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Participante de uma liga.
 *
 * Só id e nome — é o que a API devolve, por decisão de produto: a lista existe
 * para a pessoa ver **quem está disputando**, não para dar um perfil de cada
 * um. Nem e-mail (que não sai da API) nem data de entrada.
 *
 * A consequência é a mesma já assumida na lista de convite: dois cadastros com
 * o mesmo nome ficam indistinguíveis aqui.
 */
export type LeagueParticipant = {
  id: string
  name: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class ParticipantsRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível carregar os participantes agora. Tente novamente em instantes.'

function isLeagueParticipant(value: unknown): value is LeagueParticipant {
  if (typeof value !== 'object' || value === null) return false

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

/**
 * Participantes de uma liga, na ordem em que entraram — quem criou a liga
 * primeiro. A ordem vem do backend e **não é refeita aqui**: ela depende de
 * quando cada um entrou, dado que só o banco tem.
 *
 * Rota no escopo da liga, como a de candidatos, e com o mesmo ponto de
 * autorização: quem não participa recebe 403, e liga inexistente responde
 * igual — não há como descobrir liga alheia testando ids.
 *
 * O `signal` é obrigatório, não opcional, para que nenhuma chamada nasça sem
 * cancelamento: abrir e fechar o modal rápido deixaria uma resposta velha
 * chegando depois.
 */
export async function listLeagueParticipants(
  leagueId: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<LeagueParticipant[]> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/${leagueId}/participants`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new ParticipantsRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 403 traz "Você não participa desta liga."; 401, o aviso de sessão.
    const body: unknown = await response.json().catch(() => undefined)
    throw new ParticipantsRequestError(
      readApiErrorMessage(body) ?? GENERIC_FAILURE,
    )
  }

  const participants: unknown = await response.json()

  if (!Array.isArray(participants) || !participants.every(isLeagueParticipant)) {
    throw new ParticipantsRequestError(GENERIC_FAILURE)
  }

  return participants
}
