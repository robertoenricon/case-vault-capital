import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatBtc, formatUsd } from '../../lib/money'
import { TradeBitcoinPanel } from '../orders/TradeBitcoinPanel'
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
  /**
   * Id da conta de quem está olhando, para achar a própria linha na lista.
   *
   * É dali que sai a carteira usada pelo formulário de venda. A alternativa
   * era a API devolver a posição de quem pergunta também na listagem de ligas,
   * ao lado do saldo; ela já traz essa posição na lista de participantes, e um
   * campo a mais em outra rota seria o mesmo dado lido em dois lugares.
   */
  currentUserId: string
  /**
   * Avisa que uma ordem aconteceu, para o dashboard reler as ligas: o saldo
   * do card atrás do modal mudou.
   */
  onOrderExecuted: () => void
  onClose: () => void
}

/**
 * Modal de participantes: quem está disputando a liga, na ordem em que entrou,
 * com o bitcoin e o saldo de cada um — e o lugar de onde se opera.
 *
 * Nome, carteira e saldo, por decisão de produto: numa competição, todos
 * acompanham todos.
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
  currentUserId,
  onOrderExecuted,
  onClose,
}: ParticipantsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  /*
   * Saldo e carteira depois da última ordem feita **neste modal**.
   *
   * Ficam separados das fontes originais em vez de copiá-las para o estado: a
   * prop e a lista continuam sendo a verdade até existir algo mais novo, e só
   * então estes assumem. Copiar na montagem criaria estado derivado duplicado,
   * que desincroniza.
   *
   * Os números vêm da resposta da ordem — são os que o Postgres gravou. A tela
   * não soma nem subtrai nada por conta própria. A lista é relida logo em
   * seguida e confirma os mesmos valores; estes existem para a confirmação ser
   * imediata, sem esperar a volta da requisição.
   */
  const [balanceAfterOrder, setBalanceAfterOrder] = useState<string>()
  const [positionAfterOrder, setPositionAfterOrder] = useState<string>()

  const currentBalance = balanceAfterOrder ?? league.cashBalance

  const { participants, loading, error, refresh } = useLeagueParticipants(
    league.id,
    accessToken,
  )

  /*
   * Quanto bitcoin quem está olhando tem nesta liga.
   *
   * Sai da própria lista que o modal já carregou, achando a linha de quem
   * pergunta — não existe segunda requisição para isso. Fica `undefined`
   * enquanto a lista carrega ou se ela falhou, e o formulário de venda trata
   * esse caso: carteira desconhecida não é carteira vazia.
   */
  const currentPosition =
    positionAfterOrder ??
    participants?.find((participant) => participant.id === currentUserId)
      ?.bitcoinQuantity

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
        {/* Cabeçalho das colunas. Fora do `<ul>`, não como primeiro `<li>`:
            rótulo de coluna não é um participante da lista. */}
        <div className="participants__head">
          <span>Participante</span>
          <span>Bitcoin</span>
          <span>Em caixa</span>
        </div>

        <ul className="participants__list">
          {participants.map((participant) => (
            // `key` com o id da conta, nunca o índice.
            <li className="participants__person" key={participant.id}>
              <span className="participants__name">{participant.name}</span>

              {/* Posição e saldo de cada um ficam visíveis a todos: a liga é
                  uma competição, e acompanhar o adversário é o ponto. Saldo
                  sozinho enganaria — quem trocou caixa por cripto aparece com
                  pouco dinheiro e não está perdendo por isso. */}
              <span className="participants__btc">
                {/* A unidade vai no texto, não só no cabeçalho: é o que faz a
                    linha fazer sentido lida por um leitor de tela, que não
                    associa célula a coluna numa lista. */}
                {formatBtc(participant.bitcoinQuantity)} BTC
              </span>

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

        {/* Saldo e carteira são os de **quem está chamando** nesta liga (ver
            leagues.controller.ts) — exatamente os números contra os quais o
            backend compara a ordem.

            Uma ordem muda três coisas, e cada uma é relida de onde ela mora:
            saldo e carteira vêm na resposta, a lista de participantes é relida
            da API (os números de todo mundo aparecem ali) e o dashboard relê
            as ligas para o card atrás do modal. Nada é recalculado na tela. */}
        <TradeBitcoinPanel
          leagueId={league.id}
          accessToken={accessToken}
          price={bitcoin.quote?.price}
          balance={currentBalance}
          position={currentPosition}
          onExecuted={(order) => {
            setBalanceAfterOrder(order.cashBalance)
            setPositionAfterOrder(order.positionQuantity)
            refresh()
            onOrderExecuted()
          }}
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
