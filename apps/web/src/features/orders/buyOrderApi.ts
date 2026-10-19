import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Ordem executada, como a API a devolve.
 *
 * Preço e custo vêm da resposta e **não** são os que a tela estimou: o backend
 * busca a cotação no instante da execução, e ela pode ter se movido desde que
 * a pessoa olhou o ticker. A tela mostra o que aconteceu de verdade.
 */
export type ExecutedOrder = {
  symbol: string
  /** Textos decimais, como todo valor monetário da API. */
  quantity: string
  unitPrice: string
  totalCost: string
  /** Saldo **depois** da compra: a tela se atualiza sem nova requisição. */
  cashBalance: string
  /** Quantidade total do ativo em carteira depois da compra. */
  positionQuantity: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente exibe. */
export class BuyOrderError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível concluir a compra agora. Tente novamente em instantes.'

function isExecutedOrder(value: unknown): value is ExecutedOrder {
  if (typeof value !== 'object' || value === null) return false

  return (
    'symbol' in value &&
    typeof value.symbol === 'string' &&
    'quantity' in value &&
    typeof value.quantity === 'string' &&
    'unitPrice' in value &&
    typeof value.unitPrice === 'string' &&
    'totalCost' in value &&
    typeof value.totalCost === 'string' &&
    'cashBalance' in value &&
    typeof value.cashBalance === 'string' &&
    'positionQuantity' in value &&
    typeof value.positionQuantity === 'string'
  )
}

/**
 * Compra cripto na liga.
 *
 * O corpo diz **o quê** e **quanto** — nunca por quanto. Mandar um preço aqui
 * não adiantaria nada: o DTO do backend tem `forbidNonWhitelisted` ligado e
 * recusa campo não declarado. Quem decide o preço é o servidor, sempre.
 *
 * Sem `AbortSignal`, diferente das buscas deste projeto, e de propósito: esta
 * requisição **grava**. Cancelá-la no desmonte não desfaria a compra no
 * servidor — só esconderia da tela que ela aconteceu, deixando o saldo errado
 * até a próxima leitura. Quem impede o clique duplo é o guard no hook.
 */
export async function buyCrypto(
  leagueId: string,
  symbol: string,
  quantity: string,
  accessToken: string,
): Promise<ExecutedOrder> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/${leagueId}/orders`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ symbol, quantity }),
    })
  } catch (cause) {
    throw new BuyOrderError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    /*
     * As recusas do backend já vêm com texto pronto para a pessoa: 409 traz
     * "Saldo insuficiente: a ordem custa X e você tem Y", 400 traz a liga fora
     * da janela ou a quantidade inválida, 403 o não-participante e 503 a
     * cotação indisponível. A tela não reescreve nenhuma — quem conhece a
     * regra é quem a aplicou.
     */
    const body: unknown = await response.json().catch(() => undefined)
    throw new BuyOrderError(readApiErrorMessage(body) ?? GENERIC_FAILURE)
  }

  const order: unknown = await response.json()

  if (!isExecutedOrder(order)) {
    throw new BuyOrderError(GENERIC_FAILURE)
  }

  return order
}
