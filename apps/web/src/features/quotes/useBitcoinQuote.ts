import { useCallback, useEffect, useState } from 'react'
import { fetchBitcoinQuote } from './bitcoinQuoteApi'
import type { BitcoinQuote } from './bitcoinQuoteApi'

type UseBitcoinQuoteResult = {
  /** `undefined` enquanto a busca não terminou. */
  quote?: BitcoinQuote
  loading: boolean
  error?: string
  refresh: () => void
}

const GENERIC_FAILURE =
  'Não foi possível consultar a cotação agora. Tente novamente em instantes.'

/**
 * Cotação do bitcoin: busca **uma vez**, na montagem.
 *
 * Decisão de produto: o preço não se atualiza sozinho. Um `setInterval` daria
 * número vivo, mas traria timer para cancelar, stale closure para evitar e uma
 * chamada à Binance a cada ciclo por pessoa com o modal aberto — custo que não
 * se paga numa tela que hoje serve para conferir participantes. Em troca, o
 * valor exibido é uma foto, e por isso a tela mostra **de quando ele é**.
 *
 * Mesmo desenho dos outros hooks de busca do projeto: montagem dispara,
 * desmonte cancela, e `refresh` revalida quando alguém pede.
 */
export function useBitcoinQuote(accessToken: string): UseBitcoinQuoteResult {
  const [quote, setQuote] = useState<BitcoinQuote>()
  const [error, setError] = useState<string>()

  // Começa `true` por inicialização: a montagem já dispara a busca. Quem religa
  // o carregando é o `refresh`, onde existe um evento causando a busca.
  const [loading, setLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    fetchBitcoinQuote(accessToken, controller.signal)
      .then((found) => {
        setQuote(found)
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
  }, [accessToken, reloadCount])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(undefined)
    setReloadCount((count) => count + 1)
  }, [])

  return { quote, loading, error, refresh }
}
