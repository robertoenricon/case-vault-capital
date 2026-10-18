import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Cotação do bitcoin, como a nossa API a entrega.
 *
 * O front **nunca** chama a Binance direto: quem consulta a fonte é o backend.
 * Não é detalhe de organização — é o inquebrável do projeto de que o preço de
 * uma ordem é obtido no servidor. Se a tela buscasse o preço e o mandasse na
 * compra, o cliente estaria dizendo por quanto quer comprar.
 */
export type BitcoinQuote = {
  /** Código do ativo: `BTC`. */
  symbol: string
  /**
   * Preço em dólar. Texto, não `number`, pelo mesmo motivo do saldo: o valor
   * atravessa a tela sem virar ponto flutuante, e só o formatador o converte.
   */
  price: string
  /** ISO 8601 em UTC. Quem formata para o fuso de quem lê é a tela. */
  asOf: string
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, e o componente só exibe. */
export class BitcoinQuoteRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível consultar a cotação agora. Tente novamente em instantes.'

function isBitcoinQuote(value: unknown): value is BitcoinQuote {
  if (typeof value !== 'object' || value === null) return false

  return (
    'symbol' in value &&
    typeof value.symbol === 'string' &&
    'price' in value &&
    typeof value.price === 'string' &&
    'asOf' in value &&
    typeof value.asOf === 'string'
  )
}

/**
 * Busca o preço atual do bitcoin.
 *
 * Rota protegida como as outras: a cotação é pública no mundo, mas a nossa
 * rota não é — sem token, a API viraria proxy aberto da Binance.
 *
 * O `signal` é obrigatório, não opcional, pelo mesmo motivo da lista de
 * participantes: abrir e fechar o modal rápido deixaria uma resposta velha
 * chegando depois.
 */
export async function fetchBitcoinQuote(
  accessToken: string,
  signal: AbortSignal,
): Promise<BitcoinQuote> {
  let response: Response

  try {
    response = await fetch(apiUrl('/quotes/btc'), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new BitcoinQuoteRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 503 traz a mensagem de cotação indisponível; 401, o aviso de sessão.
    const body: unknown = await response.json().catch(() => undefined)
    throw new BitcoinQuoteRequestError(
      readApiErrorMessage(body) ?? GENERIC_FAILURE,
    )
  }

  const quote: unknown = await response.json()

  if (!isBitcoinQuote(quote)) {
    throw new BitcoinQuoteRequestError(GENERIC_FAILURE)
  }

  return quote
}
