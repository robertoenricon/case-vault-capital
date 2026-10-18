import { useCallback, useEffect, useState } from 'react'
import { listLeagueCandidates } from './candidatesApi'
import type { LeagueCandidate } from './candidatesApi'

type UseLeagueCandidatesResult = {
  /** `undefined` enquanto a busca não terminou — diferente de `[]`, que é "não há mais ninguém cadastrado". */
  candidates?: LeagueCandidate[]
  loading: boolean
  error?: string
  refresh: () => void
}

const GENERIC_FAILURE =
  'Não foi possível carregar as pessoas agora. Tente novamente em instantes.'

/**
 * Pessoas que podem ser convidadas para uma liga.
 *
 * Mesmo desenho do `useLeagues`: busca na montagem, cancelamento no desmonte e
 * revalidação explícita. A busca acontece quando o modal monta, e não quando o
 * dashboard carrega — a lista de contas não interessa a quem não abriu o
 * convite, e ela envelhece (alguém se cadastra) entre uma abertura e outra.
 */
export function useLeagueCandidates(
  leagueId: string,
  accessToken: string,
): UseLeagueCandidatesResult {
  const [candidates, setCandidates] = useState<LeagueCandidate[]>()
  const [error, setError] = useState<string>()

  // Começa `true` por inicialização: a montagem já dispara a busca. Quem religa
  // o carregando é o `refresh`, onde existe um evento causando a busca.
  const [loading, setLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listLeagueCandidates(leagueId, accessToken, controller.signal)
      .then((found) => {
        setCandidates(found)
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

  return { candidates, loading, error, refresh }
}
