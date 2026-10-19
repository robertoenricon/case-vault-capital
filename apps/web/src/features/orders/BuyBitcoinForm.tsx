import { useState } from 'react'
import { Field } from '../../components/Field'
import { describedBy } from '../../components/describedBy'
import { formatUsd } from '../../lib/money'
import { isAboveBalance, parseQuantity, previewTotalUsd } from './quantity'
import '../auth/authForm.css'
import './BuyBitcoinForm.css'

type BuyBitcoinFormProps = {
  /**
   * Preço atual do bitcoin, texto decimal. `undefined` enquanto a cotação
   * carrega ou quando ela falhou — sem preço não existe total, e a tela diz
   * isso em vez de mostrar zero.
   */
  price?: string
  /** Saldo de quem está na tela, nesta liga. Texto decimal, como a API manda. */
  balance: string
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
 * Quanto bitcoin comprar, e quanto isso custaria.
 *
 * Por enquanto **só calcula**: não existe botão de comprar nem chamada à API.
 * É a primeira parte do fluxo de compra, e a conta aqui é uma estimativa de
 * tela — quem decide o preço e o total da ordem é o backend (ver quantity.ts).
 *
 * O total é derivado na renderização, não guardado em `useState`: estado
 * derivado duplicado desincroniza na primeira vez que alguém esquece de
 * atualizar os dois.
 */
export function BuyBitcoinForm({ price, balance }: BuyBitcoinFormProps) {
  /*
   * A quantidade mora aqui como **texto**, exatamente como foi digitada. É o
   * valor que vai no payload da ordem quando a compra existir, e o backend o
   * espera como decimal exato — convertê-lo para `number` em algum ponto do
   * caminho seria perder precisão antes mesmo de sair da tela.
   */
  const [quantity, setQuantity] = useState('')

  const parsed = parseQuantity(quantity)

  // Sem preço não há o que estimar, e quantidade inválida também não rende
  // total: nos dois casos a linha de baixo mostra um traço.
  const total =
    parsed.kind === 'valid' && price
      ? previewTotalUsd(parsed.value, price)
      : undefined

  const aboveBalance = total !== undefined && isAboveBalance(total, balance)

  const error = parsed.kind === 'invalid' ? parsed.message : undefined
  const hint = price
    ? `Disponível: ${formatUsd(balance)}`
    : 'Sem cotação no momento — o total não pode ser calculado.'

  return (
    <section className="buy" aria-labelledby="buy-title">
      <h3 className="buy__title" id="buy-title">
        Comprar bitcoin
      </h3>

      <Field id={QUANTITY_FIELD_ID} label="Quantidade (BTC)" error={error} hint={hint}>
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
          onChange={(event) => setQuantity(event.target.value)}
          /* A borda vermelha do authForm.css é pendurada no `aria-invalid`, não
             numa classe paralela: o visual e o que o leitor de tela anuncia não
             podem divergir. */
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(QUANTITY_FIELD_ID, error, hint)}
        />
      </Field>

      {/* O total é a resposta da tela à digitação: fica em destaque, e acompanha
          o preço que está no ticker logo acima. */}
      <div className="buy__total">
        <span className="buy__total-label">Total estimado</span>
        <strong
          className={
            aboveBalance ? 'buy__total-value buy__total-value--over' : 'buy__total-value'
          }
        >
          {total === undefined ? '—' : formatUsd(total)}
        </strong>
      </div>

      {/* Avisa e deixa digitar, por decisão de produto: quem valida de verdade é
          o backend na execução da ordem; a tela só antecipa o resultado para a
          pessoa não descobrir no último clique. */}
      {aboveBalance && (
        <p className="buy__over" role="status">
          Isso passa do seu saldo de {formatUsd(balance)} nesta liga.
        </p>
      )}
    </section>
  )
}
