import { useRef, useState } from 'react'
import { inviteToLeague } from './invitesApi'

type UseInviteToLeagueResult = {
  /** Envia o convite. Chamadas durante um envio em andamento são ignoradas. */
  invite: (userId: string) => Promise<void>
  /** Id de quem está sendo convidado agora, para a linha dela mostrar o progresso. */
  invitingUserId?: string
  /** Mensagem do servidor (liga encerrada, convite duplicado, rede). */
  error?: string
}

const GENERIC_FAILURE =
  'Não foi possível enviar o convite agora. Tente novamente em instantes.'

/**
 * Caso de uso "convidar alguém para a liga" do ponto de vista da tela.
 *
 * O `onInvited` é chamado depois do envio bem-sucedido, e é por ele que o modal
 * relê a lista de pessoas: a marca "Convite enviado" vem da API, não de um
 * estado local — o backend é quem sabe quais convites existem.
 */
export function useInviteToLeague(
  leagueId: string,
  accessToken: string,
  onInvited: () => void,
): UseInviteToLeagueResult {
  const [invitingUserId, setInvitingUserId] = useState<string>()
  const [error, setError] = useState<string>()

  // O guard é um ref, não o estado: dois cliques no mesmo tick leriam o mesmo
  // valor antigo e dispararíam dois convites — o segundo voltaria com 409.
  const inFlight = useRef(false)

  async function invite(userId: string): Promise<void> {
    if (inFlight.current) return

    inFlight.current = true
    setInvitingUserId(userId)
    setError(undefined)

    try {
      await inviteToLeague(leagueId, userId, accessToken)
      onInvited()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)

      // Relê a lista também no erro: "já tem convite pendente" significa que a
      // tela está desatualizada, e é isso que a releitura corrige.
      onInvited()
    } finally {
      inFlight.current = false
      setInvitingUserId(undefined)
    }
  }

  return { invite, invitingUserId, error }
}
