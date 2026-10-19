import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Os dois lados de uma ordem, como a API os nomeia.
 *
 * Espelha `order-side.ts` do backend. É o caso que o CLAUDE.md chama de tipo
 * compartilhado duplicado à mão: aqui a sincronia é garantida pela checagem de
 * runtime logo abaixo — uma resposta com outro lado é recusada em vez de
 * entrar na tela como se fosse conhecida.
 */
export type OrderSide = 'buy' | 'sell'

const SIDES = ['buy', 'sell'] as const satisfies readonly OrderSide[]

/**
 * Ordem executada, como a API a devolve.
 *
 * Preço e valor vêm da resposta e **não** são os que a tela estimou: o backend
 * busca a cotação no instante da execução, e ela pode ter se movido desde que
 * a pessoa olhou o ticker. A tela mostra o que aconteceu de verdade.
 */
export type ExecutedOrder = {
  /** Compra ou venda. Diz se o dinheiro saiu do saldo ou entrou nele. */
  side: OrderSide
  symbol: string
  /** Textos decimais, como todo valor monetário da API. */
  quantity: string
  unitPrice: string
  /** Quanto saiu do saldo (compra) ou entrou nele (venda). */
  totalCost: string
  /** Saldo **depois** da ordem: a tela se atualiza sem nova requisição. */
  cashBalance: string
  /** Quantidade do ativo em carteira depois da ordem. */
  positionQuantity: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente exibe. */
export class OrderError extends Error {}

/**
 * Mensagem de último recurso, por lado.
 *
 * Duas, e não uma genérica, porque é o que a pessoa lê quando nada mais
 * funcionou: "não foi possível concluir a operação" não diz se o dinheiro saiu
 * ou não.
 */
const GENERIC_FAILURE: Record<OrderSide, string> = {
  buy: 'Não foi possível concluir a compra agora. Tente novamente em instantes.',
  sell: 'Não foi possível concluir a venda agora. Tente novamente em instantes.',
}

function isOrderSide(value: unknown): value is OrderSide {
  return SIDES.some((side) => side === value)
}

function isExecutedOrder(value: unknown): value is ExecutedOrder {
  if (typeof value !== 'object' || value === null) return false

  return (
    'side' in value &&
    isOrderSide(value.side) &&
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
 * Registra uma ordem de compra ou de venda na liga.
 *
 * O corpo diz **que lado**, **o quê** e **quanto** — nunca por quanto. Mandar
 * um preço aqui não adiantaria nada: o DTO do backend tem
 * `forbidNonWhitelisted` ligado e recusa campo não declarado. Quem decide o
 * preço é o servidor, sempre.
 *
 * Uma função para os dois lados porque é uma rota só, com o lado no corpo —
 * e porque tudo o que acontece em volta (autorização, erro, validação da
 * resposta) é idêntico.
 *
 * Sem `AbortSignal`, diferente das buscas deste projeto, e de propósito: esta
 * requisição **grava**. Cancelá-la no desmonte não desfaria a ordem no
 * servidor — só esconderia da tela que ela aconteceu, deixando saldo e
 * carteira errados até a próxima leitura. Quem impede o clique duplo é o guard
 * no hook.
 */
export async function placeOrder(
  leagueId: string,
  side: OrderSide,
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
      body: JSON.stringify({ side, symbol, quantity }),
    })
  } catch (cause) {
    throw new OrderError(GENERIC_FAILURE[side], { cause })
  }

  if (!response.ok) {
    /*
     * As recusas do backend já vêm com texto pronto para a pessoa: 409 traz
     * "Saldo insuficiente: a ordem custa X e você tem Y" ou "Você tem X BTC
     * nesta liga e tentou vender Y", 400 traz a liga fora da janela ou a
     * quantidade inválida, 403 o não-participante e 503 a cotação
     * indisponível. A tela não reescreve nenhuma — quem conhece a regra é quem
     * a aplicou.
     */
    const body: unknown = await response.json().catch(() => undefined)
    throw new OrderError(readApiErrorMessage(body) ?? GENERIC_FAILURE[side])
  }

  const order: unknown = await response.json()

  if (!isExecutedOrder(order)) {
    throw new OrderError(GENERIC_FAILURE[side])
  }

  return order
}
