import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { TradeBitcoinPanel } from '../orders/TradeBitcoinPanel'
import { BitcoinTicker } from '../quotes/BitcoinTicker'
import { useBitcoinQuote } from '../quotes/useBitcoinQuote'
import { LeagueStandings } from '../ranking/LeagueStandings'
import { useLeagueRanking } from '../ranking/useLeagueRanking'
import type { League } from './leaguesApi'
import '../auth/authForm.css'
import './ParticipantsModal.css'

type ParticipantsModalProps = {
  league: League
  /** Token da sessão: a rota de ranking é protegida e exige participar da liga. */
  accessToken: string
  /**
   * Id da conta de quem está olhando. Serve a duas coisas: destacar a própria
   * linha no ranking e achar a carteira usada pelo formulário de venda.
   *
   * A alternativa era a API devolver a posição de quem pergunta também na
   * listagem de ligas, ao lado do saldo; o ranking já traz essa posição, e um
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
 * Modal da liga: o ranking de quem está disputando — e o lugar de onde se
 * opera.
 *
 * Nome, carteira, saldo e colocação, por decisão de produto: numa competição,
 * todos acompanham todos.
 *
 * **Era a lista de participantes em ordem de entrada.** Virou o ranking quando
 * ele passou a existir, como este comentário previa: a colocação, o patrimônio
 * e o retorno vêm decididos pelo backend, e a lista mostra as mesmas pessoas
 * com mais informação. Duas telas para a mesma gente seriam redundância — e a
 * ordem de entrada sobrevive onde ainda importa, como critério de desempate da
 * sequência (ver ranking.repository.ts).
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

  const { ranking, loading, error, refresh } = useLeagueRanking(
    league.id,
    accessToken,
  )

  /*
   * Quanto bitcoin quem está olhando tem nesta liga.
   *
   * Sai do próprio ranking que o modal já carregou, achando a linha de quem
   * pergunta — não existe segunda requisição para isso. Fica `undefined`
   * enquanto a lista carrega ou se ela falhou, e o formulário de venda trata
   * esse caso: carteira desconhecida não é carteira vazia.
   */
  const currentPosition =
    positionAfterOrder ??
    ranking?.standings.find((standing) => standing.userId === currentUserId)
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
  function rankingSection(): ReactNode {
    if (loading) {
      return (
        <p className="participants__loading" role="status">
          Carregando o ranking…
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

    if (!ranking) return null

    return (
      <>
        {/* Colocação, patrimônio e retorno de cada um ficam visíveis a todos:
            a liga é uma competição, e acompanhar o adversário é o ponto.
            Quem ordena e posiciona é o backend — a tela só exibe. */}
        <LeagueStandings ranking={ranking} currentUserId={currentUserId} />

        {/* Liga com uma pessoa só é o estado de toda liga recém-criada: o
            ranking está certo, mas sozinho ele não explica o que falta fazer. */}
        {ranking.standings.length === 1 && (
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
            Ranking
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
            saldo e carteira vêm na resposta, o ranking é relido da API (os
            números de todo mundo, e a nova colocação, aparecem ali) e o
            dashboard relê as ligas para o card atrás do modal. Nada é
            recalculado na tela. */}
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

        {rankingSection()}

        <div className="participants__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  )
}
