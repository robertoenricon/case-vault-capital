import { useRef, useState } from 'react'
import { placeOrder } from './orderApi'
import type { ExecutedOrder, OrderSide } from './orderApi'

type UseTradeBitcoinResult = {
  /**
   * Executa a ordem. Devolve a ordem executada, ou `undefined` quando falhou
   * — nesse caso a mensagem já está em `error`.
   */
  place: (quantity: string) => Promise<ExecutedOrder | undefined>
  /** `true` enquanto a requisição está no ar: o botão vira "Comprando…"/"Vendendo…". */
  placing: boolean
  /** Mensagem do servidor (saldo, carteira, liga fora da janela, cotação, rede). */
  error?: string
  /** Limpa o erro quando a pessoa mexe no formulário de novo. */
  clearError: () => void
}

const GENERIC_FAILURE: Record<OrderSide, string> = {
  buy: 'Não foi possível concluir a compra agora. Tente novamente em instantes.',
  sell: 'Não foi possível concluir a venda agora. Tente novamente em instantes.',
}

const BITCOIN = 'BTC'

/**
 * Caso de uso "operar bitcoin" do ponto de vista da tela, dos dois lados.
 *
 * Um hook parametrizado pelo lado, e não dois quase idênticos: o que muda
 * entre comprar e vender aqui é uma palavra no payload e o texto da falha de
 * rede. Duplicar traria junto o guard de concorrência e o ciclo de estado, que
 * são a parte delicada — e que um dia seriam corrigidos só de um lado.
 *
 * O guard contra chamada concorrente é um `ref`, não o estado `placing`: dois
 * cliques no mesmo tick leriam o mesmo valor antigo de estado e disparariam
 * **duas ordens** — e, diferente de um convite duplicado, aqui as duas seriam
 * aceitas pelo backend. Operar duas vezes por engano é perder dinheiro na
 * liga; o `ref` atualiza na hora, sem esperar a re-renderização.
 *
 * O `onExecuted` é chamado só no sucesso, e é por ele que a tela relê o que
 * mudou: saldo, carteira e lista de participantes vêm da API, nunca de uma
 * conta local.
 */
export function useTradeBitcoin(
  leagueId: string,
  side: OrderSide,
  accessToken: string,
  onExecuted: (order: ExecutedOrder) => void,
): UseTradeBitcoinResult {
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string>()

  const inFlight = useRef(false)

  async function place(quantity: string): Promise<ExecutedOrder | undefined> {
    if (inFlight.current) return undefined

    inFlight.current = true
    setPlacing(true)
    setError(undefined)

    try {
      const order = await placeOrder(
        leagueId,
        side,
        BITCOIN,
        quantity,
        accessToken,
      )
      onExecuted(order)
      return order
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : GENERIC_FAILURE[side])
      return undefined
    } finally {
      inFlight.current = false
      setPlacing(false)
    }
  }

  function clearError() {
    setError(undefined)
  }

  return { place, placing, error, clearError }
}
