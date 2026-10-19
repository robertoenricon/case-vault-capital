import { Field } from '../../components/Field'
import { describedBy } from '../../components/describedBy'

/**
 * Passo das setinhas do campo.
 *
 * 0,0001 BTC — perto de US$ 8 com o bitcoin na casa dos 80 mil. Não é o mínimo
 * negociável: digitando, o campo aceita até 1 satoshi. É só o tamanho do salto
 * que as setas dão, escolhido para elas serem úteis — com passo de 1 satoshi
 * seriam necessários milhões de cliques para gastar o saldo.
 */
const ARROW_STEP = '0.0001'

type QuantityFieldProps = {
  /** Único no documento: compra e venda podem estar montadas na mesma tela. */
  id: string
  /** Texto exatamente como foi digitado — nunca convertido para `number`. */
  value: string
  onChange: (value: string) => void
  /** Mensagem de formato inválido, quando houver. */
  error?: string
  /** Linha de orientação: o saldo na compra, a carteira na venda. */
  hint: string
  disabled: boolean
}

/**
 * O campo de quantidade de bitcoin, igual nos dois lados da operação.
 *
 * Existe como componente porque comprar e vender pedem exatamente o mesmo
 * controle — e porque as armadilhas do campo numérico nativo (abaixo) são o
 * tipo de detalhe que, duplicado, seria corrigido só em um dos dois.
 *
 * O que muda entre compra e venda não entra aqui: o rótulo da dica, o limite
 * e a conta do total são decisão de cada formulário.
 */
export function QuantityField({
  id,
  value,
  onChange,
  error,
  hint,
  disabled,
}: QuantityFieldProps) {
  return (
    <Field id={id} label="Quantidade (BTC)" error={error} hint={hint}>
      <input
        className="field__input trade__quantity"
        id={id}
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        /* A borda vermelha do authForm.css é pendurada no `aria-invalid`, não
           numa classe paralela: o visual e o que o leitor de tela anuncia não
           podem divergir. */
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
    </Field>
  )
}
