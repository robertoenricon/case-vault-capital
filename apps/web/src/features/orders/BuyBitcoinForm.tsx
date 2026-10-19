import { useState } from 'react'
import { formatUsd } from '../../lib/money'
import { QuantityField } from './QuantityField'
import type { ExecutedOrder } from './orderApi'
import { isAboveBalance, parseQuantity, previewTotalUsd } from './quantity'
import { useTradeBitcoin } from './useTradeBitcoin'
import '../auth/authForm.css'
import './tradeForm.css'

type BuyBitcoinFormProps = {
  leagueId: string
  accessToken: string
  /**
   * Preço atual do bitcoin, texto decimal. `undefined` enquanto a cotação
   * carrega ou quando ela falhou — sem preço não há total estimado.
   *
   * Note que a compra **não** depende deste valor: ele serve só à estimativa
   * na tela. Quem busca o preço da ordem é o backend.
   */
  price?: string
  /** Saldo de quem está na tela, nesta liga. Texto decimal, como a API manda. */
  balance: string
  /** Chamado depois de cada compra bem-sucedida, com a ordem executada. */
  onExecuted: (order: ExecutedOrder) => void
}

const QUANTITY_FIELD_ID = 'buy-bitcoin-quantity'

/**
 * Comprar bitcoin com o dinheiro fictício da liga. O saldo é o limite.
 *
 * O total exibido é **estimativa**: a tela multiplica quantidade por preço só
 * para orientar. O que a compra envia é a quantidade; preço, custo e saldo
 * final vêm da resposta do backend, que é quem buscou a cotação no instante da
 * execução. Por isso o aviso de saldo não bloqueia o botão de forma definitiva
 * — quem recusa de verdade é o servidor, com os números dele.
 *
 * É um `<form>`: dá Enter para enviar e o botão de submit de graça, sem
 * `onKeyDown` na mão.
 */
export function BuyBitcoinForm({
  leagueId,
  accessToken,
  price,
  balance,
  onExecuted,
}: BuyBitcoinFormProps) {
  /*
   * A quantidade mora aqui como **texto**, exatamente como foi digitada. É o
   * valor que vai no payload, e o backend o espera como decimal exato —
   * convertê-lo para `number` no caminho perderia precisão antes de sair da
   * tela.
   */
  const [quantity, setQuantity] = useState('')

  /** Última compra concluída, para a tela confirmar o que de fato aconteceu. */
  const [lastOrder, setLastOrder] = useState<ExecutedOrder>()

  const { place, placing, error: orderError, clearError } = useTradeBitcoin(
    leagueId,
    'buy',
    accessToken,
    (order) => {
      setLastOrder(order)
      // Limpa o campo: deixar a quantidade ali convida a um segundo clique que
      // compraria de novo sem a pessoa perceber.
      setQuantity('')
      onExecuted(order)
    },
  )

  const parsed = parseQuantity(quantity)

  // Sem preço não há o que estimar, e quantidade inválida também não rende
  // total: nos dois casos a linha mostra um traço.
  const total =
    parsed.kind === 'valid' && price
      ? previewTotalUsd(parsed.value, price)
      : undefined

  const aboveBalance = total !== undefined && isAboveBalance(total, balance)

  const quantityError = parsed.kind === 'invalid' ? parsed.message : undefined
  const hint = price
    ? `Disponível: ${formatUsd(balance)}`
    : 'Sem cotação no momento — o total só será conhecido na confirmação.'

  function handleChange(value: string) {
    setQuantity(value)
    // Erro de uma tentativa anterior não deve ficar na tela enquanto a pessoa
    // corrige o valor.
    if (orderError) clearError()
    if (lastOrder) setLastOrder(undefined)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    // A tela não envia o que ela mesma sabe que é inválido. A validação que
    // vale continua sendo a do backend — esta só evita uma ida à rede.
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

      {/* O total é a resposta da tela à digitação: fica em destaque, e acompanha
          o preço que está no ticker logo acima. */}
      <div className="trade__total">
        <span className="trade__total-label">Total estimado</span>
        <strong
          className={
            aboveBalance
              ? 'trade__total-value trade__total-value--over'
              : 'trade__total-value'
          }
        >
          {total === undefined ? '—' : formatUsd(total)}
        </strong>
      </div>

      {/* Avisa e deixa tentar, por decisão de produto: quem valida de verdade é
          o backend na execução da ordem; a tela só antecipa o resultado para a
          pessoa não descobrir no último clique. */}
      {aboveBalance && (
        <p className="trade__over" role="status">
          Isso passa do seu saldo de {formatUsd(balance)} nesta liga.
        </p>
      )}

      <button
        type="submit"
        className="button button--primary trade__submit"
        // Desabilitado só pelo que impede a requisição de existir: sem
        // quantidade válida não há o que enviar, e durante o envio o clique
        // repetido seria uma segunda compra. **Saldo insuficiente não
        // desabilita** — quem decide isso é o backend, com o preço dele.
        disabled={parsed.kind !== 'valid' || placing}
      >
        {placing ? 'Comprando…' : 'Comprar'}
      </button>

      {/* A mensagem vem pronta do backend: "Saldo insuficiente: a ordem custa X
          e você tem Y", liga fora da janela, cotação indisponível. A tela não
          reescreve nenhuma — quem conhece a regra é quem a aplicou. */}
      {orderError && (
        <p className="form__alert form__alert--error" role="alert">
          {orderError}
        </p>
      )}

      {/* Confirmação com os números **executados**, não com os estimados: o
          preço pode ter se movido entre a tela e o servidor, e esconder isso
          faria a pessoa achar que o saldo saiu errado. */}
      {lastOrder && !orderError && (
        <p className="trade__done" role="status">
          Comprou <strong>{lastOrder.quantity} BTC</strong> a{' '}
          {formatUsd(lastOrder.unitPrice)}, total {formatUsd(lastOrder.totalCost)}.
          <br />
          Agora você tem {lastOrder.positionQuantity} BTC e{' '}
          {formatUsd(lastOrder.cashBalance)} em caixa.
        </p>
      )}
    </form>
  )
}
