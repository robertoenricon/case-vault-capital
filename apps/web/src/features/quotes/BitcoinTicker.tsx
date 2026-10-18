import { formatUsd } from '../../lib/money'
import { useBitcoinQuote } from './useBitcoinQuote'
import './BitcoinTicker.css'

type BitcoinTickerProps = {
  /** Token da sessão: a rota de cotação é protegida, como as outras. */
  accessToken: string
}

/**
 * Preço atual do bitcoin, para o topo do modal.
 *
 * É componente próprio, e não um bloco dentro do modal de participantes, por
 * um motivo concreto: cotação e lista de participantes são duas buscas
 * independentes, e uma não pode derrubar a outra. A Binance fora do ar tem que
 * deixar a lista de participantes intacta — com o preço aqui dentro, isso vem
 * de graça, porque cada um tem o próprio estado.
 *
 * Também é o que permite reaproveitar o ticker na tela de compra e venda
 * depois, sem arrastar nada de liga junto.
 */
export function BitcoinTicker({ accessToken }: BitcoinTickerProps) {
  const { quote, loading, error, refresh } = useBitcoinQuote(accessToken)

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
          onClick={refresh}
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
