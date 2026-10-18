import { STATUS_LABEL, formatPeriod } from './leagueDisplay'
import type { PendingInvite } from './invitesApi'
import '../auth/authForm.css'
import './PendingInvites.css'

type PendingInvitesProps = {
  invites: PendingInvite[]
  /** `true` enquanto uma resposta está em voo: desabilita os botões de todos os convites. */
  responding: boolean
  onAccept: (inviteId: string) => void
  onReject: (inviteId: string) => void
}

/**
 * Convites esperando resposta, acima da lista de ligas.
 *
 * Componente de apresentação: não busca nada e não decide nada. Quem busca e
 * responde é o `usePendingInvites`, pelo dashboard.
 *
 * Quem o renderiza só o monta quando há convite (ver DashboardPage), então não
 * existe estado vazio aqui — bloco vazio na tela seria ruído.
 */
export function PendingInvites({
  invites,
  responding,
  onAccept,
  onReject,
}: PendingInvitesProps) {
  return (
    <section className="invites" aria-labelledby="invites-title">
      <h2 className="invites__title" id="invites-title">
        {/* O número está no título porque é a informação que faz a pessoa
            olhar: "2 convites" tem urgência que "Convites" não tem. */}
        {invites.length === 1
          ? 'Você tem 1 convite'
          : `Você tem ${invites.length} convites`}
      </h2>

      <ul className="invites__list">
        {invites.map((invite) => (
          // `key` com o id do convite, nunca o índice: a lista muda a cada
          // resposta, e índice faria o React reaproveitar a linha errada.
          <li className="invites__item" key={invite.id}>
            <div className="invites__info">
              <p className="invites__league">
                <strong>{invite.leagueName}</strong>
                <span
                  className={`invites__status invites__status--${invite.status}`}
                >
                  {STATUS_LABEL[invite.status]}
                </span>
              </p>
              <p className="invites__period">
                {formatPeriod(invite.startsAt, invite.endsAt)}
              </p>
            </div>

            <div className="invites__actions">
              {/* O nome da liga entra no rótulo acessível: com dois convites,
                  dois botões "Participar" idênticos não dizem de qual liga. */}
              <button
                type="button"
                className="button button--primary invites__action"
                onClick={() => onAccept(invite.id)}
                disabled={responding}
                aria-label={`Participar de ${invite.leagueName}`}
              >
                Participar
              </button>

              <button
                type="button"
                className="button button--ghost invites__action"
                onClick={() => onReject(invite.id)}
                disabled={responding}
                aria-label={`Recusar o convite de ${invite.leagueName}`}
              >
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
