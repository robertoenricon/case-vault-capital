import { useCallback, useEffect, useState } from 'react'
import { listLeagueParticipants } from './participantsApi'
import type { LeagueParticipant } from './participantsApi'

type UseLeagueParticipantsResult = {
  /** `undefined` enquanto a busca não terminou. */
  participants?: LeagueParticipant[]
  loading: boolean
  error?: string
  refresh: () => void
}

const GENERIC_FAILURE =
  'Não foi possível carregar os participantes agora. Tente novamente em instantes.'

/**
 * Participantes de uma liga.
 *
 * Mesmo desenho do `useLeagueCandidates`: busca na montagem, cancelamento no
 * desmonte e revalidação explícita. A busca acontece quando o modal monta, e
 * não quando o dashboard carrega — a lista só interessa a quem abriu a liga, e
 * ela envelhece a cada convite aceito entre uma abertura e outra.
 */
export function useLeagueParticipants(
  leagueId: string,
  accessToken: string,
): UseLeagueParticipantsResult {
  const [participants, setParticipants] = useState<LeagueParticipant[]>()
  const [error, setError] = useState<string>()

  // Começa `true` por inicialização: a montagem já dispara a busca. Quem religa
  // o carregando é o `refresh`, onde existe um evento causando a busca.
  const [loading, setLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listLeagueParticipants(leagueId, accessToken, controller.signal)
      .then((found) => {
        setParticipants(found)
        setLoading(false)
      })
      .catch((failure: unknown) => {
        // Busca cancelada não é falha: o modal fechou, ou já existe uma busca
        // mais nova. Mostrar erro aqui faria piscar mensagem no StrictMode,
        // que monta duas vezes.
        if (controller.signal.aborted) return

        setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)
        setLoading(false)
      })

    return () => controller.abort()
  }, [leagueId, accessToken, reloadCount])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(undefined)
    setReloadCount((count) => count + 1)
  }, [])

  return { participants, loading, error, refresh }
}
