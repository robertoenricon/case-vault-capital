import { apiUrl } from '../../lib/api'
import { readApiErrorMessage } from '../../lib/apiError'

/**
 * Uma colocação do ranking, exatamente como a API a devolve.
 *
 * **Todos os números são texto decimal**, como no resto da aplicação: o valor
 * exato atravessa estado e props, e só vira `number` dentro do formatador (ver
 * lib/money.ts). A tela não soma, não ordena e não recalcula nada daqui — a
 * colocação e o patrimônio vieram decididos pelo backend.
 */
export type Standing = {
  /**
   * Colocação a partir de 1. **Repete em caso de empate** e pula a seguinte
   * (1º, 1º, 3º), então não serve como chave de lista nem como índice.
   */
  position: number
  /** Id da conta — é por ele que a tela acha a própria linha. É a chave da lista. */
  userId: string
  name: string
  cashBalance: string
  bitcoinQuantity: string
  /** Quanto o bitcoin em carteira vale agora, em dólar. */
  bitcoinValue: string
  /** Patrimônio: caixa + bitcoin. É o número que define a colocação. */
  equity: string
  /** Pontos percentuais sobre o saldo inicial: `"4.3"` é +4,3%, `"-1.23"` é -1,23%. */
  returnPercent: string
}

export type LeagueRanking = {
  /** Saldo com que todos começaram. Base do percentual. */
  initialBalance: string
  /**
   * Preço usado para avaliar as carteiras.
   *
   * **Ausente quando ninguém na liga tem bitcoin** — nesse caso o backend nem
   * consulta a cotação, porque ela não entraria em conta nenhuma. A tela usa a
   * ausência para não anunciar uma avaliação que não aconteceu.
   */
  bitcoinPrice?: string
  /** Quando o preço foi lido da fonte, em ISO 8601. Ausente pelo mesmo motivo. */
  pricedAt?: string
  standings: Standing[]
}

/** Erro já pronto para a tela: a mensagem é decidida aqui, o componente só exibe. */
export class RankingRequestError extends Error {}

const GENERIC_FAILURE =
  'Não foi possível carregar o ranking agora. Tente novamente em instantes.'

function isStanding(value: unknown): value is Standing {
  if (typeof value !== 'object' || value === null) return false

  return (
    'position' in value &&
    typeof value.position === 'number' &&
    'userId' in value &&
    typeof value.userId === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'cashBalance' in value &&
    typeof value.cashBalance === 'string' &&
    'bitcoinQuantity' in value &&
    typeof value.bitcoinQuantity === 'string' &&
    'bitcoinValue' in value &&
    typeof value.bitcoinValue === 'string' &&
    'equity' in value &&
    typeof value.equity === 'string' &&
    'returnPercent' in value &&
    typeof value.returnPercent === 'string'
  )
}

function isLeagueRanking(value: unknown): value is LeagueRanking {
  if (typeof value !== 'object' || value === null) return false

  if (!('initialBalance' in value) || typeof value.initialBalance !== 'string') {
    return false
  }

  // Preço e instante são opcionais **por contrato**, não por descuido: quando
  // ninguém tem bitcoin eles não vêm. Ausente passa; presente precisa ser texto.
  if ('bitcoinPrice' in value && typeof value.bitcoinPrice !== 'string') return false
  if ('pricedAt' in value && typeof value.pricedAt !== 'string') return false

  return (
    'standings' in value &&
    Array.isArray(value.standings) &&
    value.standings.every(isStanding)
  )
}

/**
 * Ranking de uma liga, já ordenado e posicionado pelo backend.
 *
 * Mesmo ponto de autorização das outras rotas de liga: quem não participa
 * recebe 403, e liga inexistente responde igual — não há como descobrir liga
 * alheia testando ids.
 *
 * Pode responder **503** quando alguém na liga tem bitcoin e a cotação está
 * indisponível: sem preço não existe patrimônio, e o backend prefere recusar a
 * devolver uma classificação errada. A mensagem vem pronta de lá.
 *
 * O `signal` é obrigatório, não opcional, para que nenhuma chamada nasça sem
 * cancelamento: abrir e fechar o modal rápido deixaria uma resposta velha
 * chegando depois.
 */
export async function fetchLeagueRanking(
  leagueId: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<LeagueRanking> {
  let response: Response

  try {
    response = await fetch(apiUrl(`/leagues/${leagueId}/ranking`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    })
  } catch (cause) {
    // Inclui o cancelamento: quem chamou confere o `signal` antes de mostrar
    // erro, porque busca cancelada não é falha para quem está na tela.
    throw new RankingRequestError(GENERIC_FAILURE, { cause })
  }

  if (!response.ok) {
    // 403 traz "Você não participa desta liga."; 503, o aviso de cotação.
    const body: unknown = await response.json().catch(() => undefined)
    throw new RankingRequestError(readApiErrorMessage(body) ?? GENERIC_FAILURE)
  }

  const ranking: unknown = await response.json()

  if (!isLeagueRanking(ranking)) {
    throw new RankingRequestError(GENERIC_FAILURE)
  }

  return ranking
}
