import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '../auth/session'
import { CreateLeagueModal } from './CreateLeagueModal'
import { InviteFriendsModal } from './InviteFriendsModal'
import { LeagueCard } from './LeagueCard'
import { ParticipantsModal } from './ParticipantsModal'
import { PendingInvites } from './PendingInvites'
import type { League } from './leaguesApi'
import { useLeagues } from './useLeagues'
import { usePendingInvites } from './usePendingInvites'
// `.button` e `.form__alert` nasceram no formulário de autenticação e são usados
// aqui também. O import é explícito de propósito: hoje o bundle já carregaria
// esse CSS por causa do login, mas depender disso seria depender de ordem de
// import — se o login virar rota carregada sob demanda, o botão perderia o estilo.
import '../auth/authForm.css'
import './DashboardPage.css'

type DashboardPageProps = {
  /** A sessão inteira, não só o usuário: as rotas de liga são protegidas e precisam do token. */
  session: Session
  onLogout: () => void
}

/**
 * Primeira tela de quem está logado: as ligas de que a pessoa participa.
 *
 * A lista vem da API em toda montagem da tela, e é por isso que ela sobrevive
 * ao recarregar a página. O componente não guarda cópia editável dela: depois
 * de criar uma liga, pede a lista de novo em vez de inserir a nova na mão —
 * assim não existem duas versões da verdade para divergirem.
 */
export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const [modalOpen, setModalOpen] = useState(false)

  // Confirmação do que acabou de acontecer nesta visita (liga criada, convite
  // aceito), já como a frase que aparece na tela. É estado de interface puro —
  // a lista de ligas continua vindo da API.
  const [notice, setNotice] = useState<string>()

  // Liga cujo convite está aberto. Guarda a liga, e não só o id: o modal mostra
  // o nome dela, e buscá-lo de novo na lista seria procurar o que já se tem em
  // mãos no clique.
  const [invitingTo, setInvitingTo] = useState<League>()

  // Liga cuja lista de participantes está aberta. Dois estados separados, e não
  // um só com o tipo do modal: cada modal é aberto por um clique diferente, e
  // um estado único faria o fechamento de um precisar saber do outro.
  const [viewingParticipantsOf, setViewingParticipantsOf] = useState<League>()

  const { leagues, loading, error, refresh } = useLeagues(session.accessToken)

  const {
    invites,
    error: invitesError,
    responding,
    accept,
    reject,
  } = usePendingInvites(session.accessToken)

  const { user } = session

  function handleCreated(league: League) {
    setNotice(`Liga “${league.name}” criada. Você já está dentro dela.`)
    setModalOpen(false)
    refresh()
  }

  /**
   * Aceitar o convite muda as duas listas: o convite sai (o próprio hook relê)
   * e a liga passa a ser uma das minhas — por isso a lista de ligas é relida
   * aqui. A liga não é inserida na mão na lista: ela vem da API, com a situação
   * e a ordenação que o backend decide.
   */
  async function handleAccept(inviteId: string) {
    const joined = await accept(inviteId)

    // `undefined` = falhou, e o hook já colocou a mensagem de erro na tela.
    if (!joined) return

    setNotice(`Você entrou na liga “${joined.name}”.`)
    refresh()
  }

  /**
   * Os quatro estados do carregamento, em `if` com saída antecipada em vez de
   * ternários encadeados no JSX: a ordem das perguntas fica legível, e nenhum
   * estado pode aparecer junto com outro por acidente.
   *
   * Não é um componente, é uma função que devolve JSX — não tem estado nem
   * hook próprio, então não precisa ser um.
   */
  function leaguesSection(): ReactNode {
    if (loading) {
      return (
        <p className="dashboard__loading" role="status">
          Carregando suas ligas…
        </p>
      )
    }

    if (error) {
      return (
        <div className="dashboard__retry">
          <p className="form__alert form__alert--error" role="alert">
            {error}
          </p>
          <button type="button" className="button button--ghost" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )
    }

    // Vazio é tela de verdade, não tabela em branco: é o primeiro estado de
    // toda conta nova.
    if (!leagues || leagues.length === 0) {
      return (
        <section className="dashboard__empty" aria-labelledby="empty-title">
          <h2 className="dashboard__empty-title" id="empty-title">
            Nenhuma liga por aqui
          </h2>
          <p className="dashboard__empty-text">
            Você ainda não participa de nenhuma liga. Comece criando a sua — você
            define o período da disputa e já entra como participante.
          </p>
        </section>
      )
    }

    return (
      <ul className="dashboard__list">
        {leagues.map((league) => (
          // `key` com o id da liga, nunca o índice: a lista reordena quando uma
          // liga muda de situação, e índice faria o React reaproveitar o card errado.
          <LeagueCard
            key={league.id}
            league={league}
            onInvite={() => setInvitingTo(league)}
            onShowParticipants={() => setViewingParticipantsOf(league)}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard__topbar">
        <p className="dashboard__brand">Case Vault Capital</p>

        <div className="dashboard__account">
          {/* Nome e e-mail vêm da resposta do login, não de decodificar o token:
              o front não interpreta JWT. */}
          <span className="dashboard__user" title={user.email}>
            {user.name}
          </span>
          <button type="button" className="button button--ghost" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="dashboard__content">
        <div className="dashboard__heading">
          <div>
            <h1 className="dashboard__title">Minhas ligas</h1>
            <p className="dashboard__subtitle">
              Crie uma liga, convide seus amigos e dispute quem opera melhor.
            </p>
          </div>

          <button
            type="button"
            className="button button--primary"
            onClick={() => setModalOpen(true)}
          >
            Criar liga
          </button>
        </div>

        {/* `role="status"` e não `alert`: é confirmação, não problema. */}
        {notice && (
          <p className="form__alert form__alert--success" role="status">
            {notice}
          </p>
        )}

        {/* Erro de convite (busca ou resposta) fica acima do bloco, separado do
            erro da lista de ligas: são duas requisições independentes, e uma
            falhar não impede a outra de funcionar. */}
        {invitesError && (
          <p className="form__alert form__alert--error" role="alert">
            {invitesError}
          </p>
        )}

        {/* O bloco só existe quando há convite: sem nenhum, não há aviso a dar
            — e é por isso que o hook de convites não tem estado "vazio". */}
        {invites && invites.length > 0 && (
          <PendingInvites
            invites={invites}
            responding={responding}
            onAccept={handleAccept}
            onReject={reject}
          />
        )}

        {leaguesSection()}
      </main>

      {/*
        Montado e desmontado pelo estado, em vez de ficar sempre no DOM
        escondido: o `<dialog>` abre no efeito de montagem, e assim o formulário
        começa limpo a cada abertura — sem precisar resetar campo por campo.
      */}
      {modalOpen && (
        <CreateLeagueModal
          accessToken={session.accessToken}
          onCreated={handleCreated}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Mesmo padrão: montar e desmontar em vez de esconder. Aqui isso também
          garante que a lista de pessoas é buscada de novo a cada abertura — ela
          envelhece quando alguém se cadastra. */}
      {invitingTo && (
        <InviteFriendsModal
          league={invitingTo}
          accessToken={session.accessToken}
          onClose={() => setInvitingTo(undefined)}
        />
      )}

      {/* Mesmo padrão dos outros dois, e aqui montar e desmontar também é o que
          mantém a lista atual: participante novo aparece sem recarregar a
          página, porque cada abertura busca de novo. */}
      {viewingParticipantsOf && (
        <ParticipantsModal
          league={viewingParticipantsOf}
          accessToken={session.accessToken}
          // Para o modal achar a própria linha na lista: é de lá que sai a
          // carteira contra a qual o formulário de venda avisa.
          currentUserId={session.user.id}
          // Operar muda o saldo, que aparece no card da liga atrás do modal.
          // A lista é relida da API, nunca ajustada na mão aqui.
          onOrderExecuted={refresh}
          onClose={() => setViewingParticipantsOf(undefined)}
        />
      )}
    </div>
  )
}
