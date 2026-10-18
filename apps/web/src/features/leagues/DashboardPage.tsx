import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '../auth/session'
import { CreateLeagueModal } from './CreateLeagueModal'
import { InviteFriendsModal } from './InviteFriendsModal'
import { LeagueCard } from './LeagueCard'
import type { League } from './leaguesApi'
import { useLeagues } from './useLeagues'
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

  // Nome da liga criada nesta visita, só para a confirmação. Não é a lista: a
  // lista vem da API.
  const [justCreatedName, setJustCreatedName] = useState<string>()

  // Liga cujo convite está aberto. Guarda a liga, e não só o id: o modal mostra
  // o nome dela, e buscá-lo de novo na lista seria procurar o que já se tem em
  // mãos no clique.
  const [invitingTo, setInvitingTo] = useState<League>()

  const { leagues, loading, error, refresh } = useLeagues(session.accessToken)

  const { user } = session

  function handleCreated(league: League) {
    setJustCreatedName(league.name)
    setModalOpen(false)
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
        {justCreatedName && (
          <p className="form__alert form__alert--success" role="status">
            Liga “{justCreatedName}” criada. Você já está dentro dela.
          </p>
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
    </div>
  )
}
