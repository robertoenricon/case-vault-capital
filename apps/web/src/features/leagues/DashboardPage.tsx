import { useState } from 'react'
import type { Session } from '../auth/session'
import { CreateLeagueModal } from './CreateLeagueModal'
import type { CreatedLeague } from './createLeagueApi'
// `.button` e `.form__alert` nasceram no formulário de autenticação e são usados
// aqui também. O import é explícito de propósito: hoje o bundle já carregaria
// esse CSS por causa do login, mas depender disso seria depender de ordem de
// import — se o login virar rota carregada sob demanda, o botão perderia o estilo.
import '../auth/authForm.css'
import './DashboardPage.css'

type DashboardPageProps = {
  /** A sessão inteira, não só o usuário: criar liga é rota protegida e precisa do token. */
  session: Session
  onLogout: () => void
}

/**
 * Primeira tela de quem está logado: o painel das ligas da pessoa.
 *
 * A tela ainda não **busca** ligas — não existe rota de listagem. O que ela
 * mostra é o que acabou de ser criado nesta visita, direto da resposta da API;
 * ao recarregar a página, volta ao estado vazio. É uma lacuna conhecida, não um
 * bug escondido: a listagem entra com o `GET /leagues`.
 */
export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const [modalOpen, setModalOpen] = useState(false)

  // Liga criada nesta visita. Mora aqui, e não no modal, porque sobrevive ao
  // fechamento dele.
  const [createdLeague, setCreatedLeague] = useState<CreatedLeague>()

  const { user } = session

  function handleCreated(league: CreatedLeague) {
    setCreatedLeague(league)
    setModalOpen(false)
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

        {createdLeague ? (
          <section className="dashboard__created">
            <p className="form__alert form__alert--success" role="status">
              Liga criada. Você já está dentro dela.
            </p>

            <h2 className="dashboard__league-name">{createdLeague.name}</h2>
            <p className="dashboard__league-period">
              {formatPeriod(createdLeague.startsAt, createdLeague.endsAt)}
            </p>
            <p className="dashboard__league-note">
              A lista com todas as suas ligas aparece aqui quando a rota de
              listagem existir — por enquanto, esta visita mostra só o que você
              acabou de criar.
            </p>
          </section>
        ) : (
          /*
            Estado vazio, e não uma tabela em branco (10.3). Sem rota de
            listagem, é o que a tela sabe dizer de verdade sobre ligas antigas:
            nada. Os estados de carregando e erro entram junto da busca.
          */
          <section className="dashboard__empty" aria-labelledby="empty-title">
            <h2 className="dashboard__empty-title" id="empty-title">
              Nenhuma liga por aqui
            </h2>
            <p className="dashboard__empty-text">
              Você ainda não criou nenhuma liga nesta visita. Comece criando a
              sua — você define o período da disputa e já entra como
              participante.
            </p>
          </section>
        )}
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
    </div>
  )
}

/**
 * Período no formato de quem está lendo. A API manda ISO em UTC; o front
 * formata, mas não recalcula nada — o dia exibido é o instante que o backend
 * gravou, lido no fuso do navegador.
 */
function formatPeriod(startsAt: string, endsAt: string): string {
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })

  return `${format.format(new Date(startsAt))} até ${format.format(new Date(endsAt))}`
}
