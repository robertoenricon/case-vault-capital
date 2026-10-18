import type { Session } from '../auth/session'
// `.button` e `.form__alert` nasceram no formulário de autenticação e são usados
// aqui também. O import é explícito de propósito: hoje o bundle já carregaria
// esse CSS por causa do login, mas depender disso seria depender de ordem de
// import — se o login virar rota carregada sob demanda, o botão perderia o estilo.
import '../auth/authForm.css'
import './DashboardPage.css'

type DashboardPageProps = {
  user: Session['user']
  onLogout: () => void
}

/**
 * Primeira tela de quem está logado: o painel das ligas da pessoa.
 *
 * Esta etapa é só o layout. A tela não busca nada e não calcula nada — não há
 * endpoint de liga ainda. Por isso o botão "Criar liga" existe sem ação: o
 * handler chega junto do formulário de criação, na próxima etapa. Preferi o
 * botão inerte a um `onClick` vazio: um `() => {}` pareceria código pronto.
 */
export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  return (
    <div className="dashboard">
      <header className="dashboard__topbar">
        <p className="dashboard__brand">Case Vault Capital</p>

        <div className="dashboard__account">
          {/* Nome e e-mail vêm da resposta do login, não de decodificar o JWT:
              o front não interpreta token. */}
          <span className="dashboard__user" title={user.email}>
            {user.name}
          </span>
          <button
            type="button"
            className="button button--ghost"
            onClick={onLogout}
          >
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

          <button type="button" className="button button--primary">
            Criar liga
          </button>
        </div>

        {/*
          Estado vazio, e não uma tabela em branco (10.3). Hoje ele é o único
          estado possível: não existe como criar liga ainda. É esta região que
          recebe a lista quando o endpoint existir — junto dos estados de
          carregando e erro, que só fazem sentido quando houver requisição.
        */}
        <section className="dashboard__empty" aria-labelledby="empty-title">
          <h2 className="dashboard__empty-title" id="empty-title">
            Nenhuma liga por aqui
          </h2>
          <p className="dashboard__empty-text">
            Você ainda não participa de nenhuma liga. Comece criando a sua — você
            define o período da disputa e convida quem vai competir.
          </p>
        </section>
      </main>
    </div>
  )
}
