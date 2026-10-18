import { STATUS_LABEL, formatPeriod } from './leagueDisplay'
import type { League } from './leaguesApi'
import '../auth/authForm.css'
import './LeagueCard.css'

type LeagueCardProps = {
  league: League
  /** Clique em "Convidar amigos". Quem decide o que acontece é o dashboard. */
  onInvite: () => void
}

/**
 * Uma liga na lista: nome, período, situação e a ação de convidar.
 *
 * O card não é clicável: a ação está num botão próprio, com rótulo. Card
 * inteiro clicável obriga a adivinhar o que o clique faz e atrapalha quando
 * aparecer uma segunda ação na linha (abrir a liga, ver ranking) — aí dois
 * alvos disputariam o mesmo clique.
 *
 * Como o nome não vive mais dentro de um `<button>` (que aceita só conteúdo de
 * frase), ele volta a ser `<h3>`: cada liga tem título de verdade na lista.
 *
 * Componente de apresentação: não busca nada e não calcula nada. Formata as
 * datas que vieram em ISO e traduz a situação.
 */
export function LeagueCard({ league, onInvite }: LeagueCardProps) {
  return (
    <li className="league-card">
      <div className="league-card__info">
        <h3 className="league-card__name">{league.name}</h3>
        <p className="league-card__period">
          {formatPeriod(league.startsAt, league.endsAt)}
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
