import { useCallback, useEffect, useState } from 'react'
import { listLeagues } from './leaguesApi'
import type { League } from './leaguesApi'

type UseLeaguesResult = {
  /** `undefined` enquanto a primeira busca não terminou — diferente de `[]`, que é "não participa de nenhuma". */
  leagues?: League[]
  loading: boolean
  /** Mensagem do servidor ou de rede. `undefined` = nada a mostrar. */
  error?: string
  /** Busca de novo. Usado depois de criar uma liga e no "tentar de novo". */
  refresh: () => void
}

const GENERIC_FAILURE =
  'Não foi possível carregar suas ligas agora. Tente novamente em instantes.'

/**
 * Ligas de quem está logado, vindas da API.
 *
 * Este é **estado de servidor**, não de interface: a tela não guarda uma cópia
 * editável da lista, ela mostra o que a API respondeu e pede de novo quando
 * algo muda. É o que faz a liga continuar na tela depois de recarregar a
 * página — antes disso, a liga criada só existia na memória do navegador.
 *
 * Sem lib de cache por enquanto: uma busca na montagem e revalidação explícita
 * dão conta de uma tela. Quando houver mais telas lendo as mesmas ligas, isso
 * vira cache de verdade (React Query ou equivalente) em vez de um hook por tela.
 */
export function useLeagues(accessToken: string): UseLeaguesResult {
  const [leagues, setLeagues] = useState<League[]>()
  const [error, setError] = useState<string>()

  // Começa `true` por inicialização, e não por um `setLoading(true)` dentro do
  // efeito: a montagem já dispara a busca, então "carregando" é o estado
  // inicial correto. Quem liga o carregando de novo é o `refresh`, porque lá
  // existe um evento (o clique) causando a busca.
  const [loading, setLoading] = useState(true)

  // Contador de revalidação: mudar o valor é o que dispara o efeito de novo.
  // Mais simples do que duplicar a busca numa função fora do efeito, e sem
  // risco de as duas cópias divergirem.
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listLeagues(accessToken, controller.signal)
      .then((found) => {
        setLeagues(found)
        setLoading(false)
      })
      .catch((failure: unknown) => {
        // Busca cancelada não é falha: aconteceu porque a tela saiu do ar ou
        // porque já existe uma busca mais nova. Mostrar erro aqui faria piscar
        // "não foi possível carregar" no StrictMode, que monta duas vezes.
        if (controller.signal.aborted) return

        setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)
        setLoading(false)
      })

    // Cancela a busca ao sair da tela ou ao começar outra: sem isso, a resposta
    // lenta de uma busca antiga sobrescreveria o resultado da nova.
    return () => controller.abort()
  }, [accessToken, reloadCount])

  const refresh = useCallback(() => {
    // O estado de carregando e a limpeza do erro saem daqui, do evento que
    // pediu a busca, e não do efeito que a executa.
    setLoading(true)
    setError(undefined)
    setReloadCount((count) => count + 1)
  }, [])

  return { leagues, loading, error, refresh }
}
