import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { League } from './leaguesApi'
import { useInviteToLeague } from './useInviteToLeague'
import { useLeagueCandidates } from './useLeagueCandidates'
import '../auth/authForm.css'
import './InviteFriendsModal.css'

type InviteFriendsModalProps = {
  league: League
  /** Token da sessão: a rota de candidatos é protegida e exige participar da liga. */
  accessToken: string
  onClose: () => void
}

/**
 * Modal de convite: as pessoas cadastradas na plataforma, com a ação de
 * convidar ao lado de cada uma.
 *
 * O convite não coloca ninguém na liga — ele espera resposta. Quem foi
 * convidado vê o convite no próprio painel e decide (ver PendingInvites.tsx).
 * Por isso a marca ao lado do nome tem três estados, não dois: já participa,
 * convite pendente, ou disponível para convidar.
 *
 * Mesmo `<dialog>` nativo do modal de criar liga: foco preso, Esc e fundo
 * inerte vêm do navegador.
 */
export function InviteFriendsModal({
  league,
  accessToken,
  onClose,
}: InviteFriendsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const { candidates, loading, error, refresh } = useLeagueCandidates(
    league.id,
    accessToken,
  )

  // A lista é relida depois de cada convite: a marca "Convite enviado" vem da
  // API, e não de um estado local que poderia discordar do backend.
  const {
    invite,
    invitingUserId,
    error: inviteError,
  } = useInviteToLeague(league.id, accessToken, refresh)

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
   * Os quatro estados da busca, em `if` com saída antecipada: a ordem das
   * perguntas fica legível e nenhum estado aparece junto com outro.
   */
  function peopleSection(): ReactNode {
    if (loading) {
      return (
        <p className="invite__loading" role="status">
          Carregando as pessoas…
        </p>
      )
    }

    if (error) {
      return (
        <div className="invite__retry">
          <p className="form__alert form__alert--error" role="alert">
            {error}
          </p>
          <button type="button" className="button button--ghost" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )
    }

    // Vazio real: ninguém mais tem conta na plataforma além de quem está
    // olhando. Acontece de verdade num MVP recém-publicado.
    if (!candidates || candidates.length === 0) {
      return (
        <p className="invite__empty">
          Ninguém mais tem conta por aqui ainda. Quando seus amigos se
          cadastrarem, eles aparecem nesta lista.
        </p>
      )
    }

    return (
      <ul className="invite__list">
        {candidates.map((person) => (
          // `key` com o id da conta, nunca o índice.
          <li className="invite__person" key={person.id}>
            <span className="invite__name">{person.name}</span>

            {/* A ordem das perguntas importa: quem já participa não tem
                convite pendente, então "já participa" vem primeiro. */}
            {person.alreadyParticipant ? (
              <span className="invite__already">Já participa</span>
            ) : person.invitePending ? (
              <span className="invite__already">Convite enviado</span>
            ) : (
              <button
                type="button"
                className="button button--primary invite__action"
                onClick={() => invite(person.id)}
                // Desabilita só durante o envio: a trava contra clique duplo é
                // o ref dentro do hook, isto é o aviso visual.
                disabled={invitingUserId !== undefined}
                aria-label={`Convidar ${person.name} para ${league.name}`}
              >
                {invitingUserId === person.id ? 'Enviando…' : 'Convidar'}
              </button>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <dialog
      className="invite"
      ref={dialogRef}
      aria-labelledby="invite-title"
      onCancel={(event) => {
        // Esc sai pelo mesmo caminho do botão Fechar. Sem o `preventDefault`,
        // o navegador fecharia o dialog e o componente continuaria montado —
        // invisível e impossível de reabrir.
        event.preventDefault()
        onClose()
      }}
    >
      <div className="invite__box">
        <header>
          <h2 className="invite__title" id="invite-title">
            Convidar amigos
          </h2>
          <p className="invite__subtitle">
            Para a liga <strong>{league.name}</strong>.
          </p>
        </header>

        {/* Erro do envio, separado do erro da busca: a lista continua na tela
            e utilizável, só aquele convite falhou. */}
        {inviteError && (
          <p className="form__alert form__alert--error" role="alert">
            {inviteError}
          </p>
        )}

        {peopleSection()}

        <div className="invite__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  )
}
