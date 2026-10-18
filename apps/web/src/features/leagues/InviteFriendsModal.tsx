import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { League } from './leaguesApi'
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
 * **O botão "Convidar" ainda não faz nada** — esta etapa é a tela, e a ação
 * ficou para a próxima. Ele não tem `onClick` em vez de ter um `() => {}`: um
 * handler vazio pareceria código pronto, e o convite envolve decisões que ainda
 * não foram tomadas (o convite entra direto ou precisa de aceite?).
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

            {person.alreadyParticipant ? (
              <span className="invite__already">Já participa</span>
            ) : (
              <button type="button" className="button button--primary invite__action">
                Convidar
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
