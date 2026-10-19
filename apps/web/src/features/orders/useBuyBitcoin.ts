import { useRef, useState } from 'react'
import { buyCrypto } from './buyOrderApi'
import type { ExecutedOrder } from './buyOrderApi'

type UseBuyBitcoinResult = {
  /**
   * Executa a compra. Devolve a ordem executada, ou `undefined` quando falhou
   * — nesse caso a mensagem já está em `error`.
   */
  buy: (quantity: string) => Promise<ExecutedOrder | undefined>
  /** `true` enquanto a requisição está no ar: o botão vira "Comprando…". */
  buying: boolean
  /** Mensagem do servidor (saldo, liga fora da janela, cotação, rede). */
  error?: string
  /** Limpa o erro quando a pessoa mexe no formulário de novo. */
  clearError: () => void
}

const GENERIC_FAILURE =
  'Não foi possível concluir a compra agora. Tente novamente em instantes.'

const BITCOIN = 'BTC'

/**
 * Caso de uso "comprar bitcoin" do ponto de vista da tela.
 *
 * O guard contra chamada concorrente é um `ref`, não o estado `buying`: dois
 * cliques no mesmo tick leriam o mesmo valor antigo de estado e disparariam
 * **duas compras** — e, diferente de um convite duplicado, aqui as duas seriam
 * aceitas pelo backend. Comprar duas vezes por engano é perder dinheiro na
 * liga; o `ref` atualiza na hora, sem esperar a re-renderização.
 *
 * O `onExecuted` é chamado só no sucesso, e é por ele que a tela relê o que
 * mudou: saldo e lista de participantes vêm da API, nunca de uma conta local.
 */
export function useBuyBitcoin(
  leagueId: string,
  accessToken: string,
  onExecuted: (order: ExecutedOrder) => void,
): UseBuyBitcoinResult {
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string>()

  const inFlight = useRef(false)

  async function buy(quantity: string): Promise<ExecutedOrder | undefined> {
    if (inFlight.current) return undefined

    inFlight.current = true
    setBuying(true)
    setError(undefined)

    try {
      const order = await buyCrypto(leagueId, BITCOIN, quantity, accessToken)
      onExecuted(order)
      return order
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)
      return undefined
    } finally {
      inFlight.current = false
      setBuying(false)
    }
  }

  function clearError() {
    setError(undefined)
  }

  return { buy, buying, error, clearError }
}
