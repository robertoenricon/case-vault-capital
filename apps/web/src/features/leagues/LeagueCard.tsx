import { formatUsd } from '../../lib/money'
import { STATUS_LABEL, formatPeriod } from './leagueDisplay'
import type { League } from './leaguesApi'
import '../auth/authForm.css'
import './LeagueCard.css'

type LeagueCardProps = {
  league: League
  /** Clique em "Convidar amigos". Quem decide o que acontece é o dashboard. */
  onInvite: () => void
  /** Clique no nome da liga: abre os participantes. Quem decide é o dashboard. */
  onShowParticipants: () => void
}

/**
 * Uma liga na lista: nome, período, situação e as ações.
 *
 * O card **inteiro** não é clicável: cada ação tem seu próprio alvo. Card
 * inteiro clicável obriga a adivinhar o que o clique faz e brigaria com o botão
 * de convidar, que vive dentro dele.
 *
 * O nome é um `<button>` dentro do `<h3>`: continua sendo o título da liga na
 * lista (e por isso navegável como cabeçalho por leitor de tela), mas é também
 * o que abre os participantes. `<h3>` aceita conteúdo de frase, e `<button>` é
 * conteúdo de frase — a estrutura é válida, diferente do inverso.
 *
 * Componente de apresentação: não busca nada e não calcula nada. Formata as
 * datas que vieram em ISO e traduz a situação.
 */
export function LeagueCard({
  league,
  onInvite,
  onShowParticipants,
}: LeagueCardProps) {
  return (
    <li className="league-card">
      <div className="league-card__info">
        <h3 className="league-card__name">
          {/* O rótulo acessível diz o que o clique faz: o texto visível é só o
              nome da liga, que sozinho não anuncia uma ação. */}
          <button
            type="button"
            className="league-card__name-button"
            onClick={onShowParticipants}
            aria-label={`Ver participantes de ${league.name}`}
          >
            {league.name}
          </button>
        </h3>
        <p className="league-card__period">
          {formatPeriod(league.startsAt, league.endsAt)}
        </p>

        {/* O saldo é desta liga, não da conta: a mesma pessoa tem uma carteira
            em cada liga de que participa. O rótulo diz isso em uma palavra —
            sem ele, "US$ 10.000,00" solto parece saldo da plataforma. */}
        <p className="league-card__balance">
          <span className="league-card__balance-label">Seu saldo na liga</span>
          <strong className="league-card__balance-value">
            {formatUsd(league.cashBalance)}
          </strong>
        </p>
      </div>

      <div className="league-card__actions">
        {/* A classe carrega a situação para o CSS poder diferenciar a cor sem
            que o componente escolha cor nenhuma. */}
        <span
          className={`league-card__status league-card__status--${league.status}`}
        >
          {STATUS_LABEL[league.status]}
        </span>

        {/* O nome da liga entra no rótulo acessível, não no texto visível: numa
            lista de cinco ligas, cinco botões "Convidar amigos" idênticos não
            dizem a quem leva cada um. */}
        <button
          type="button"
          className="button button--ghost league-card__invite"
          onClick={onInvite}
          aria-label={`Convidar amigos para ${league.name}`}
        >
          Convidar amigos
        </button>
      </div>
    </li>
  )
}
