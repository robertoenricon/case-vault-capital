import { useRef, useState } from 'react'
import { BuyBitcoinForm } from './BuyBitcoinForm'
import { SellBitcoinForm } from './SellBitcoinForm'
import type { ExecutedOrder, OrderSide } from './orderApi'
import './tradeForm.css'

type TradeBitcoinPanelProps = {
  leagueId: string
  accessToken: string
  /** Preço atual, texto decimal. `undefined` enquanto carrega ou se falhou. */
  price?: string
  /** Saldo em dinheiro de quem está na tela, nesta liga. */
  balance: string
  /** Bitcoin em carteira de quem está na tela. `undefined` enquanto não se sabe. */
  position?: string
  /** Chamado depois de cada ordem executada, de qualquer lado. */
  onExecuted: (order: ExecutedOrder) => void
}

/** Rótulo de cada aba. A lista define a ordem na tela: comprar primeiro. */
const TABS: readonly { side: OrderSide; label: string }[] = [
  { side: 'buy', label: 'Comprar' },
  { side: 'sell', label: 'Vender' },
]

const tabId = (side: OrderSide) => `trade-tab-${side}`
const panelId = (side: OrderSide) => `trade-panel-${side}`

/**
 * Comprar e vender bitcoin, lado a lado, num bloco só.
 *
 * Abas em vez de dois formulários simultâneos por decisão de produto: o modal
 * já carrega cotação e a lista de participantes, e duas operações abertas ao
 * mesmo tempo dobrariam a altura justamente onde o espaço é mais escasso. O
 * preço é só uma operação visível por vez.
 *
 * **Só a aba ativa é montada**, e isso é escolha: trocar de aba zera o campo.
 * Manter as duas montadas preservaria a quantidade digitada, mas deixaria um
 * número esquecido no formulário oculto, pronto para ser enviado do lado
 * errado por quem voltasse à aba sem olhar.
 *
 * As abas são `role="tab"` de verdade, com `aria-selected` e navegação por
 * setas, e não dois botões que parecem abas: quem usa leitor de tela precisa
 * ouvir "aba 1 de 2" para saber que existe a outra operação ali.
 */
export function TradeBitcoinPanel({
  leagueId,
  accessToken,
  price,
  balance,
  position,
  onExecuted,
}: TradeBitcoinPanelProps) {
  const [side, setSide] = useState<OrderSide>('buy')

  // Referência para mover o foco junto com a seleção: é o que o padrão de abas
  // espera das setas, e sem isso o foco ficaria na aba que não está mais ativa.
  const tabRefs = useRef<Partial<Record<OrderSide, HTMLButtonElement | null>>>({})

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Com exatamente duas abas, esquerda e direita fazem a mesma coisa: ir
    // para a outra. Uma lista de atalhos por índice seria generalidade para
    // uma variação que não existe.
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return

    event.preventDefault()
    const next: OrderSide = side === 'buy' ? 'sell' : 'buy'
    setSide(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="trade" aria-label="Operar bitcoin">
      <div className="trade__tabs" role="tablist" onKeyDown={handleKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.side}
            ref={(element) => {
              tabRefs.current[tab.side] = element
            }}
            type="button"
            className="trade__tab"
            role="tab"
            id={tabId(tab.side)}
            aria-selected={side === tab.side}
            aria-controls={panelId(tab.side)}
            /* Só a aba ativa entra na ordem do Tab: dentro do grupo quem
               navega são as setas. É o "roving tabindex" do padrão. */
            tabIndex={side === tab.side ? 0 : -1}
            onClick={() => setSide(tab.side)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId(side)}
        aria-labelledby={tabId(side)}
      >
        {side === 'buy' ? (
          <BuyBitcoinForm
            leagueId={leagueId}
            accessToken={accessToken}
            price={price}
            balance={balance}
            onExecuted={onExecuted}
          />
        ) : (
          <SellBitcoinForm
            leagueId={leagueId}
            accessToken={accessToken}
            price={price}
            position={position}
            onExecuted={onExecuted}
          />
        )}
      </div>
    </section>
  )
}
