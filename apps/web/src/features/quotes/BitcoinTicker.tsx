import { formatUsd } from '../../lib/money'
import type { BitcoinQuote } from './bitcoinQuoteApi'
import './BitcoinTicker.css'

type BitcoinTickerProps = {
  /** `undefined` enquanto carrega e quando a consulta falhou. */
  quote?: BitcoinQuote
  loading: boolean
  error?: string
  onRetry: () => void
}

/**
 * Preço atual do bitcoin, para o topo do modal.
 *
 * Só exibe: a busca é de quem o renderiza. Nasceu buscando por conta própria,
 * quando era o único interessado no preço, e virou apresentacional quando o
 * formulário de compra passou a precisar da **mesma** cotação. Com dois hooks
 * independentes seriam duas chamadas à Binance por abertura de modal, e os
 * dois blocos da tela poderiam exibir preços diferentes.
 *
 * A independência que importa continua de pé: a cotação tem estado próprio,
 * separado do da lista de participantes, então a Binance fora do ar não tira
 * a lista do ar.
 */
export function BitcoinTicker({
  quote,
  loading,
  error,
  onRetry,
}: BitcoinTickerProps) {
  if (loading) {
    return (
      <div className="ticker" role="status">
        <span className="ticker__label">Bitcoin</span>
        <span className="ticker__pending">Consultando…</span>
      </div>
    )
  }

  /*
   * Falha da fonte é aviso, não erro de tela: o modal continua útil sem o
   * preço. Por isso não usa `role="alert"` nem a faixa vermelha dos
   * formulários — quem abriu o modal veio ver os participantes, e a cotação
   * ausente não impede nada do que ele veio fazer.
   */
  if (error || !quote) {
    return (
      <div className="ticker ticker--off">
        <span className="ticker__label">Bitcoin</span>
        <span className="ticker__pending">Cotação indisponível</span>
        <button
          type="button"
          className="ticker__retry"
          onClick={onRetry}
          /* O texto visível é curto por caber no header; quem usa leitor de
             tela ouve o que o botão realmente faz. */
          aria-label="Tentar consultar a cotação de novo"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <div className="ticker">
      <span className="ticker__label">Bitcoin</span>
      <strong className="ticker__price">{formatUsd(quote.price)}</strong>
      {/* O preço não se atualiza sozinho (ver useBitcoinQuote). Dizer de quando
          ele é não é enfeite: é o que impede alguém tratar um número parado
          como preço ao vivo. */}
      <span className="ticker__asof">às {formatTime(quote.asOf)}</span>
    </div>
  )
}

/**
 * Hora da cotação no fuso de quem está lendo. A API manda ISO em UTC e o
 * navegador converte — nada é recalculado aqui.
 *
 * Criado uma vez, fora da função, pelo mesmo motivo do formatador de dólar.
 */
const TIME = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

function formatTime(isoInstant: string): string {
  return TIME.format(new Date(isoInstant))
}
