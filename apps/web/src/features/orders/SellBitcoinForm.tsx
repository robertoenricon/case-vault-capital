import { useState } from 'react'
import { formatBtc, formatUsd } from '../../lib/money'
import { QuantityField } from './QuantityField'
import type { ExecutedOrder } from './orderApi'
import { isAbovePosition, parseQuantity, previewTotalUsd } from './quantity'
import { useTradeBitcoin } from './useTradeBitcoin'
import '../auth/authForm.css'
import './tradeForm.css'

type SellBitcoinFormProps = {
  leagueId: string
  accessToken: string
  /**
   * Preço atual do bitcoin, texto decimal. `undefined` enquanto a cotação
   * carrega ou quando ela falhou — sem preço não há valor estimado.
   */
  price?: string
  /**
   * Bitcoin que quem está na tela tem nesta liga, texto decimal.
   *
   * `undefined` enquanto a lista de participantes carrega, ou se ela falhou:
   * nesse caso a tela não avisa nada sobre o limite e deixa tentar. Inventar
   * "0" ali faria o formulário dizer que a pessoa não tem nada — o oposto de
   * não saber.
   */
  position?: string
  /** Chamado depois de cada venda bem-sucedida, com a ordem executada. */
  onExecuted: (order: ExecutedOrder) => void
}

const QUANTITY_FIELD_ID = 'sell-bitcoin-quantity'

/**
 * Vender bitcoin de volta para o dinheiro fictício da liga. A carteira é o
 * limite: **venda a descoberto não existe** neste produto.
 *
 * Espelho do formulário de compra, com uma diferença que não é cosmética: o
 * que limita aqui é a quantidade em carteira, não o saldo. Quem gastou tudo
 * comprando precisa conseguir vender com zero dólares em caixa.
 *
 * O valor exibido é **estimativa**, pelo mesmo motivo da compra: quem busca o
 * preço da ordem é o backend, no instante da execução.
 */
export function SellBitcoinForm({
  leagueId,
  accessToken,
  price,
  position,
  onExecuted,
}: SellBitcoinFormProps) {
  /* Texto, exatamente como digitado — nunca convertido para `number`. */
  const [quantity, setQuantity] = useState('')

  /** Última venda concluída, para a tela confirmar o que de fato aconteceu. */
  const [lastOrder, setLastOrder] = useState<ExecutedOrder>()

  const { place, placing, error: orderError, clearError } = useTradeBitcoin(
    leagueId,
    'sell',
    accessToken,
    (order) => {
      setLastOrder(order)
      // Limpa o campo: deixar a quantidade ali convida a um segundo clique que
      // venderia de novo sem a pessoa perceber.
      setQuantity('')
      onExecuted(order)
    },
  )

  const parsed = parseQuantity(quantity)

  const total =
    parsed.kind === 'valid' && price
      ? previewTotalUsd(parsed.value, price)
      : undefined

  // Só avisa sobre o limite quando ele é conhecido. Carteira ainda carregando
  // não é carteira vazia.
  const abovePosition =
    parsed.kind === 'valid' &&
    position !== undefined &&
    isAbovePosition(parsed.value, position)

  const quantityError = parsed.kind === 'invalid' ? parsed.message : undefined
  const hint =
    position === undefined
      ? 'Carregando quanto você tem em carteira…'
      : `Em carteira: ${formatBtc(position)} BTC`

  function handleChange(value: string) {
    setQuantity(value)
    if (orderError) clearError()
    if (lastOrder) setLastOrder(undefined)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (parsed.kind !== 'valid') return

    await place(parsed.value)
  }

  return (
    <form className="trade__form" onSubmit={handleSubmit}>
      <QuantityField
        id={QUANTITY_FIELD_ID}
        value={quantity}
        onChange={handleChange}
        error={quantityError}
        hint={hint}
        disabled={placing}
      />

      <div className="trade__total">
        {/* "Você recebe", e não "Total": na venda o dinheiro entra, e o mesmo
            rótulo dos dois lados esconderia justamente a diferença. */}
        <span className="trade__total-label">Você recebe</span>
        <strong
          className={
            abovePosition
              ? 'trade__total-value trade__total-value--over'
              : 'trade__total-value'
          }
        >
          {total === undefined ? '—' : formatUsd(total)}
        </strong>
      </div>

      {/* Avisa e deixa tentar, como na compra: a carteira desta tela pode ter
          mudado desde que a lista foi carregada, e quem recusa de verdade é o
          backend, comparando em decimal exato no instante da ordem. */}
      {abovePosition && position !== undefined && (
        <p className="trade__over" role="status">
          Você tem {formatBtc(position)} BTC nesta liga. Não é possível vender
          mais do que isso.
        </p>
      )}

      <button
        type="submit"
        className="button button--primary trade__submit"
        // Mesmo critério da compra: desabilitado só pelo que impede a
        // requisição de existir. Carteira insuficiente não desabilita — e
        // carteira desconhecida, menos ainda.
        disabled={parsed.kind !== 'valid' || placing}
      >
        {placing ? 'Vendendo…' : 'Vender'}
      </button>

      {/* Mensagem pronta do backend: "Você tem X BTC nesta liga e tentou vender
          Y", liga fora da janela, cotação indisponível. */}
      {orderError && (
        <p className="form__alert form__alert--error" role="alert">
          {orderError}
        </p>
      )}

      {/* Confirmação com os números **executados**. O preço pode ter se movido
          entre a tela e o servidor. */}
      {lastOrder && !orderError && (
        <p className="trade__done" role="status">
          Vendeu <strong>{lastOrder.quantity} BTC</strong> a{' '}
          {formatUsd(lastOrder.unitPrice)}, recebendo{' '}
          {formatUsd(lastOrder.totalCost)}.
          <br />
          Agora você tem {lastOrder.positionQuantity} BTC e{' '}
          {formatUsd(lastOrder.cashBalance)} em caixa.
        </p>
      )}
    </form>
  )
}
