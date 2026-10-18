import type { League, LeagueStatus } from './leaguesApi'
import './LeagueCard.css'

type LeagueCardProps = {
  league: League
}

/**
 * Palavra que cada situação recebe na tela.
 *
 * A decisão de **qual é** a situação é do backend; aqui se decide só como ela
 * se chama em português. Trocar "Em andamento" por "Valendo agora" não toca na
 * API.
 */
const STATUS_LABEL: Record<LeagueStatus, string> = {
  running: 'Em andamento',
  scheduled: 'Agendada',
  finished: 'Encerrada',
}

/**
 * Uma liga na lista: nome, período e situação.
 *
 * Componente de apresentação — não busca nada, não calcula nada. Formata as
 * datas que vieram em ISO e traduz a situação.
 */
export function LeagueCard({ league }: LeagueCardProps) {
  return (
    <li className="league-card">
      <div className="league-card__info">
        <h3 className="league-card__name">{league.name}</h3>
        <p className="league-card__period">
          {formatPeriod(league.startsAt, league.endsAt)}
        </p>
      </div>

      {/* A classe carrega a situação para o CSS poder diferenciar a cor sem que
          o componente escolha cor nenhuma. */}
      <span className={`league-card__status league-card__status--${league.status}`}>
        {STATUS_LABEL[league.status]}
      </span>
    </li>
  )
}

/**
 * Período no formato de quem está lendo. A API manda ISO em UTC; o front
 * formata, mas não recalcula nada — o dia exibido é o instante que o backend
 * gravou, lido no fuso do navegador.
 */
function formatPeriod(startsAt: string, endsAt: string): string {
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })

  return `${format.format(new Date(startsAt))} até ${format.format(new Date(endsAt))}`
}
