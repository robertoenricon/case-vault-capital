import { useCallback, useEffect, useState } from 'react'
import { fetchLeagueRanking } from './rankingApi'
import type { LeagueRanking } from './rankingApi'

type UseLeagueRankingResult = {
  /** `undefined` enquanto a busca não terminou. */
  ranking?: LeagueRanking
  loading: boolean
  error?: string
  refresh: () => void
}

const GENERIC_FAILURE =
  'Não foi possível carregar o ranking agora. Tente novamente em instantes.'

/**
 * Ranking de uma liga.
 *
 * Mesmo desenho do `useLeagueParticipants` que ele substitui: busca na
 * montagem, cancelamento no desmonte e revalidação explícita pelo `refresh`.
 *
 * **Não atualiza sozinho**, e isso é coerente com o resto do app: a cotação
 * também é uma foto por abertura de modal (decisão registrada). Um ranking que
 * se mexesse a cada poucos segundos exigiria atualizar o preço junto, ou
 * mostraria colocação nova com preço velho. Quem provoca a releitura é quem
 * opera: o painel de compra e venda chama `refresh` depois de cada ordem.
 */
export function useLeagueRanking(
  leagueId: string,
  accessToken: string,
): UseLeagueRankingResult {
  const [ranking, setRanking] = useState<LeagueRanking>()
  const [error, setError] = useState<string>()

  // Começa `true` por inicialização: a montagem já dispara a busca. Quem religa
  // o carregando é o `refresh`, onde existe um evento causando a busca.
  const [loading, setLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetchLeagueRanking(leagueId, accessToken, controller.signal)
      .then((found) => {
        setRanking(found)
        // Uma releitura bem-sucedida apaga o erro da anterior: sem isto, um
        // 503 de cotação ficaria na tela ao lado do ranking que acabou de
        // chegar.
        setError(undefined)
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

  return { ranking, loading, error, refresh }
}
