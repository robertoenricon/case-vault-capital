import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { formatUsd } from '../../lib/money'
import { BuyBitcoinForm } from '../orders/BuyBitcoinForm'
import { BitcoinTicker } from '../quotes/BitcoinTicker'
import { useBitcoinQuote } from '../quotes/useBitcoinQuote'
import type { League } from './leaguesApi'
import { useLeagueParticipants } from './useLeagueParticipants'
import '../auth/authForm.css'
import './ParticipantsModal.css'

type ParticipantsModalProps = {
  league: League
  /** Token da sessão: a rota de participantes é protegida e exige participar da liga. */
  accessToken: string
  onClose: () => void
}

/**
 * Modal de participantes: quem está disputando a liga, na ordem em que entrou,
 * com o saldo de cada um.
 *
 * Nome e saldo, por decisão de produto: numa competição, todos acompanham todos.
 * A ordem vem do backend — primeiro quem criou a liga, depois quem aceitou
 * convite — e a tela não reordena nada. **Nem ordena por saldo**: quando o
 * ranking existir, quem decide a posição é o backend, com a métrica dele.
 *
 * Mesmo `<dialog>` nativo dos outros dois modais: foco preso, Esc e fundo
 * inerte vêm do navegador.
 */
export function ParticipantsModal({
  league,
  accessToken,
  onClose,
}: ParticipantsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const { participants, loading, error, refresh } = useLeagueParticipants(
    league.id,
    accessToken,
  )

  /*
   * A cotação é buscada **aqui**, e não dentro do ticker, porque dois blocos
   * da tela dependem dela: o preço exibido e o total estimado da compra. Com
   * um hook em cada um seriam duas chamadas à Binance por abertura de modal, e
   * eles poderiam mostrar preços diferentes um do outro.
   *
   * Busca separada da dos participantes de propósito: cada uma tem o próprio
   * carregando e o próprio erro, então a Binance fora do ar não tira a lista
   * do ar — e vice-versa.
   */
  const bitcoin = useBitcoinQuote(accessToken)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // A checagem de `open` existe porque o StrictMode roda o efeito duas vezes
    // em desenvolvimento, e `showModal()` num dialog já aberto estoura.
    if (!dialog.open) dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  /**
   * Os estados da busca, em `if` com saída antecipada: a ordem das perguntas
   * fica legível e nenhum estado aparece junto com outro.
   *
   * Não existe estado "vazio" aqui, diferente da lista de convite: toda liga
   * tem pelo menos quem a criou, e quem não participa não chega a ver a
   * resposta — recebe o erro de autorização. O caso real de lista curta é a
   * liga de uma pessoa só, tratado abaixo com um aviso, não com tela vazia.
   */
  function participantsSection(): ReactNode {
    if (loading) {
      return (
        <p className="participants__loading" role="status">
          Carregando os participantes…
        </p>
      )
    }

    if (error) {
      return (
        <div className="participants__retry">
          <p className="form__alert form__alert--error" role="alert">
            {error}
          </p>
          <button type="button" className="button button--ghost" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )
    }

    if (!participants) return null

    return (
      <>
        <ul className="participants__list">
          {participants.map((participant) => (
            // `key` com o id da conta, nunca o índice.
            <li className="participants__person" key={participant.id}>
              <span className="participants__name">{participant.name}</span>
              {/* O saldo de cada um fica visível a todos os participantes: a
                  liga é uma competição, e acompanhar o adversário é o ponto. */}
              <span className="participants__balance">
                {formatUsd(participant.cashBalance)}
              </span>
            </li>
          ))}
        </ul>

        {/* Liga com uma pessoa só é o estado de toda liga recém-criada: a lista
            está certa, mas sozinha ela não explica o que falta fazer. */}
        {participants.length === 1 && (
          <p className="participants__alone">
            Você é a única pessoa nesta liga por enquanto. Use “Convidar amigos”
            no card da liga para chamar mais gente.
          </p>
        )}
      </>
    )
  }

  return (
    <dialog
      className="participants"
      ref={dialogRef}
      aria-labelledby="participants-title"
      onCancel={(event) => {
        // Esc sai pelo mesmo caminho do botão Fechar. Sem o `preventDefault`,
        // o navegador fecharia o dialog e o componente continuaria montado —
        // invisível e impossível de reabrir.
        event.preventDefault()
        onClose()
      }}
    >
      <div className="participants__box">
        <header>
          <h2 className="participants__title" id="participants-title">
            Participantes
          </h2>
          <p className="participants__subtitle">
            Da liga <strong>{league.name}</strong>.
          </p>
        </header>

        {/* Cotação no header, acima da lista: é o preço com que a liga opera, e
            vem antes dos saldos porque é o que dá sentido a eles. */}
        <BitcoinTicker
          quote={bitcoin.quote}
          loading={bitcoin.loading}
          error={bitcoin.error}
          onRetry={bitcoin.refresh}
        />

        {/* `league.cashBalance` é o saldo de **quem está chamando** nesta liga
            (ver leagues.controller.ts), que é exatamente o saldo contra o qual
            a compra precisa ser comparada. */}
        <BuyBitcoinForm
          price={bitcoin.quote?.price}
          balance={league.cashBalance}
        />

        {participantsSection()}

        <div className="participants__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  )
}
