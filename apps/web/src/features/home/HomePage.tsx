import type { Session } from '../auth/session'
import './HomePage.css'

type HomePageProps = {
  user: Session['user']
  onLogout: () => void
}

/**
 * Tela de quem está logado.
 *
 * É um marco de lugar, não a home do produto: ela existe para a sessão ter um
 * destino e para o login ser verificável de ponta a ponta. A home de verdade
 * (ligas, carteira, ranking) entra quando essas features existirem.
 *
 * Nome e e-mail vêm da resposta do login, não de decodificar o token: o front
 * não interpreta JWT.
 */
export function HomePage({ user, onLogout }: HomePageProps) {
  return (
    <main className="home">
      <section className="home__card">
        <p className="home__brand">Case Vault Capital</p>
        <h1 className="home__title">Você está dentro, {user.name}.</h1>
        <p className="home__text">
          Sessão ativa como <strong>{user.email}</strong>.
        </p>
        <p className="home__text home__text--muted">
          As ligas, a carteira e o ranking entram nas próximas etapas.
        </p>

        <button type="button" className="button button--ghost" onClick={onLogout}>
          Sair
        </button>
      </section>
    </main>
  )
}
