import { formatBtc, formatUsd } from '../../lib/money'
import { formatPercent } from './percent'
import type { LeagueRanking } from './rankingApi'
import './LeagueStandings.css'

type LeagueStandingsProps = {
  ranking: LeagueRanking
  /** Id de quem está olhando, para destacar a própria linha. */
  currentUserId: string
}

/**
 * A classificação da liga: quem está na frente, com quanto e quanto variou.
 *
 * **Não ordena, não soma e não calcula percentual.** Colocação, patrimônio e
 * retorno chegam decididos do backend — este componente formata e desenha. É
 * a mesma regra do resto do front: quem decide é o servidor, a tela exibe.
 *
 * `<ol>` e não `<ul>`: ranking é lista ordenada, e é isso que um leitor de
 * tela anuncia. A numeração automática fica desligada no CSS porque ela
 * discordaria da colocação em caso de empate — dois primeiros lugares
 * receberiam "1" e "2" do navegador.
 */
export function LeagueStandings({ ranking, currentUserId }: LeagueStandingsProps) {
  /*
   * Quantas pessoas dividem cada colocação.
   *
   * Serve só para marcar o empate na tela: ver "1º" duas vezes seguidas sem
   * explicação parece defeito. Não é recálculo de regra — a colocação já veio
   * pronta, e isto apenas descreve o que chegou.
   */
  const sharedPositions = new Map<number, number>()

  for (const standing of ranking.standings) {
    sharedPositions.set(
      standing.position,
      (sharedPositions.get(standing.position) ?? 0) + 1,
    )
  }

  return (
    <>
      {/* Cabeçalho das colunas. Fora da lista, não como primeiro item:
          rótulo de coluna não é um participante. */}
      <div className="standings__head">
        <span>#</span>
        <span>Participante</span>
        <span>Patrimônio</span>
        <span>Retorno</span>
      </div>

      <ol className="standings__list">
        {ranking.standings.map((standing) => {
          const isCurrentUser = standing.userId === currentUserId
          const isTied = (sharedPositions.get(standing.position) ?? 0) > 1

          return (
            // `key` com o id da conta, nunca o índice nem a colocação: a lista
            // reordena a cada ordem executada, e a colocação repete no empate.
            <li
              className={
                isCurrentUser ? 'standings__row standings__row--me' : 'standings__row'
              }
              key={standing.userId}
            >
              <span className="standings__position">{standing.position}º</span>

              <span className="standings__name">
                {standing.name}
                {isCurrentUser && <span className="standings__you"> (você)</span>}
                {isTied && (
                  <span className="standings__tie" title="Mesmo patrimônio">
                    empate
                  </span>
                )}
              </span>

              {/* O patrimônio é o número que define a colocação — por isso é o
                  valor em destaque, e o caixa desce para a linha de detalhe. */}
              <span className="standings__equity">{formatUsd(standing.equity)}</span>

              <span
                className={percentClass(standing.returnPercent)}
                /* O sinal já está no texto ("+4,30%"), mas a cor sozinha não
                   serve a quem não a distingue — e é a cor que salta aos olhos
                   na varredura da lista. */
              >
                {formatPercent(standing.returnPercent)}
              </span>

              {/* De onde o patrimônio veio. Sem esta linha, quem está com o
                  caixa baixo e muito bitcoin aparece liderando sem motivo
                  visível. */}
              <span className="standings__detail">
                {formatBtc(standing.bitcoinQuantity)} BTC
                {' · '}
                {formatUsd(standing.cashBalance)} em caixa
              </span>
            </li>
          )
        })}
      </ol>

      <p className="standings__basis">{valuationNote(ranking)}</p>
    </>
  )
}

/**
 * Com que preço as carteiras foram avaliadas.
 *
 * Um ranking que se move com o mercado precisa dizer de quando é o número;
 * sem isso, a pessoa vê a colocação mudar entre duas aberturas do modal e não
 * tem como saber por quê.
 *
 * Quando **ninguém** tem bitcoin, o backend não consulta a cotação e não manda
 * preço — e aqui a frase muda, em vez de omitir. Dizer que não precisou de
 * cotação explica por que o ranking funciona até com a Binance fora do ar.
 */
function valuationNote(ranking: LeagueRanking): string {
  if (!ranking.bitcoinPrice) {
    return 'Ninguém comprou bitcoin ainda, então todos seguem com o saldo inicial.'
  }

  const base = `Patrimônio avaliado com o bitcoin a ${formatUsd(ranking.bitcoinPrice)}`

  if (!ranking.pricedAt) return `${base}.`

  const readAt = new Date(ranking.pricedAt)

  // Data inválida não deve virar "às Invalid Date" na tela.
  if (Number.isNaN(readAt.getTime())) return `${base}.`

  const time = readAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${base}, lido às ${time}.`
}

/**
 * Classe do retorno: verde para ganho, vermelho para perda, neutro no zero.
 *
 * Comparação numérica, e não `startsWith('-')`, por causa do zero negativo: o
 * backend já arredonda para duas casas antes de mandar, então uma perda
 * minúscula chega como `"-0"` — que é zero, e pintá-la de vermelho ao lado de
 * um "0,00%" seria mostrar prejuízo onde a tela diz que não houve. `Number`
 * aqui é seguro justamente porque o valor já vem arredondado: não há precisão
 * a perder.
 */
function percentClass(returnPercent: string): string {
  const value = Number(returnPercent)

  if (value > 0) return 'standings__percent standings__percent--up'
  if (value < 0) return 'standings__percent standings__percent--down'

  // Zero, zero negativo e qualquer resposta fora do formato caem no neutro.
  return 'standings__percent'
}
