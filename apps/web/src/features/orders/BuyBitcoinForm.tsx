import { useState } from 'react'
import { Field } from '../../components/Field'
import { describedBy } from '../../components/describedBy'
import { formatUsd } from '../../lib/money'
import type { ExecutedOrder } from './buyOrderApi'
import { isAboveBalance, parseQuantity, previewTotalUsd } from './quantity'
import { useBuyBitcoin } from './useBuyBitcoin'
import '../auth/authForm.css'
import './BuyBitcoinForm.css'

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

/**
 * Passo das setinhas do campo.
 *
 * 0,0001 BTC — perto de US$ 8 com o bitcoin na casa dos 80 mil. Não é o mínimo
 * negociável: digitando, o campo aceita até 1 satoshi. É só o tamanho do salto
 * que as setas dão, escolhido para elas serem úteis — com passo de 1 satoshi
 * seriam necessários milhões de cliques para gastar o saldo.
 */
const ARROW_STEP = '0.0001'

const QUANTITY_FIELD_ID = 'buy-bitcoin-quantity'

/**
 * Comprar bitcoin com o dinheiro fictício da liga.
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

  const { buy, buying, error: buyError, clearError } = useBuyBitcoin(
    leagueId,
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
    if (buyError) clearError()
    if (lastOrder) setLastOrder(undefined)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    // A tela não envia o que ela mesma sabe que é inválido. A validação que
    // vale continua sendo a do backend — esta só evita uma ida à rede.
    if (parsed.kind !== 'valid') return

    await buy(parsed.value)
  }

  return (
    <form className="buy" onSubmit={handleSubmit} aria-labelledby="buy-title">
      <h3 className="buy__title" id="buy-title">
        Comprar bitcoin
      </h3>

      <Field
        id={QUANTITY_FIELD_ID}
        label="Quantidade (BTC)"
        error={quantityError}
        hint={hint}
      >
        <input
          className="field__input buy__quantity"
          id={QUANTITY_FIELD_ID}
          /*
           * `type="number"` é o que dá as setinhas de aumentar e diminuir sem
           * código nosso. O preço: o navegador devolve string vazia enquanto o
           * conteúdo não é um número completo, então o total some por um
           * instante no meio de "0." até virar "0.1". É incômodo conhecido do
           * campo numérico nativo, não bug do cálculo.
           */
          type="number"
          inputMode="decimal"
          step={ARROW_STEP}
          min="0"
          placeholder="0,0000"
          value={quantity}
          onChange={(event) => handleChange(event.target.value)}
          disabled={buying}
          /* A borda vermelha do authForm.css é pendurada no `aria-invalid`, não
             numa classe paralela: o visual e o que o leitor de tela anuncia não
             podem divergir. */
          aria-invalid={quantityError ? true : undefined}
          aria-describedby={describedBy(QUANTITY_FIELD_ID, quantityError, hint)}
        />
      </Field>

      {/* O total é a resposta da tela à digitação: fica em destaque, e acompanha
          o preço que está no ticker logo acima. */}
      <div className="buy__total">
        <span className="buy__total-label">Total estimado</span>
        <strong
          className={
            aboveBalance
              ? 'buy__total-value buy__total-value--over'
              : 'buy__total-value'
          }
        >
          {total === undefined ? '—' : formatUsd(total)}
        </strong>
      </div>

      {/* Avisa e deixa tentar, por decisão de produto: quem valida de verdade é
          o backend na execução da ordem; a tela só antecipa o resultado para a
          pessoa não descobrir no último clique. */}
      {aboveBalance && (
        <p className="buy__over" role="status">
          Isso passa do seu saldo de {formatUsd(balance)} nesta liga.
        </p>
      )}

      <button
        type="submit"
        className="button button--primary buy__submit"
        // Desabilitado só pelo que impede a requisição de existir: sem
        // quantidade válida não há o que enviar, e durante o envio o clique
        // repetido seria uma segunda compra. **Saldo insuficiente não
        // desabilita** — quem decide isso é o backend, com o preço dele.
        disabled={parsed.kind !== 'valid' || buying}
      >
        {buying ? 'Comprando…' : 'Comprar'}
      </button>

      {/* A mensagem vem pronta do backend: "Saldo insuficiente: a ordem custa X
          e você tem Y", liga fora da janela, cotação indisponível. A tela não
          reescreve nenhuma — quem conhece a regra é quem a aplicou. */}
      {buyError && (
        <p className="form__alert form__alert--error" role="alert">
          {buyError}
        </p>
      )}

      {/* Confirmação com os números **executados**, não com os estimados: o
          preço pode ter se movido entre a tela e o servidor, e esconder isso
          faria a pessoa achar que o saldo saiu errado. */}
      {lastOrder && !buyError && (
        <p className="buy__done" role="status">
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
