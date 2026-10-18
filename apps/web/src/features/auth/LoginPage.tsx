import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from './session'
import { useLogin } from './useLogin'
import './authForm.css'
import './LoginPage.css'

type LoginPageProps = {
  /** Chamado quando a API aceitou as credenciais, com o token e quem entrou. */
  onAuthenticated: (session: Session) => void
  onRegisterClick: () => void
  /** Aviso vindo de outra tela, como a confirmação de que a conta foi criada. */
  notice?: string
  /** E-mail já preenchido: quem acabou de se cadastrar não deve digitar de novo. */
  initialEmail?: string
}

/**
 * Tela de login
 */
export function LoginPage({
  onAuthenticated,
  onRegisterClick,
  notice,
  initialEmail,
}: LoginPageProps) {
  // A requisição e seus estados moram no hook; aqui só se decide o que mostrar.
  const { submit, submitting, error } = useLogin(onAuthenticated)

  // Valor inicial, não estado espelhado: a partir daqui quem manda no campo é
  // quem está digitando, e a tela é montada de novo quando vem do cadastro.
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Vai como foi digitado: aparar espaços e normalizar a caixa do e-mail é
    // decisão do backend, que é quem sabe como o e-mail virou chave.
    void submit({ email, password })
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <header className="login__header">
          <p className="login__brand">Case Vault Capital</p>
          <h1 className="login__title">Entrar</h1>
          <p className="login__subtitle">
            Acesse sua conta para operar nas suas ligas.
          </p>
        </header>

        {/* `role="status"` e não `alert`: é confirmação, não problema. */}
        {notice && (
          <p className="form__alert form__alert--success" role="status">
            {notice}
          </p>
        )}

        <div className="field">
          <label className="field__label" htmlFor="email">
            E-mail
          </label>
          <input
            className="field__input"
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="password">
            Senha
          </label>
          <input
            className="field__input"
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {/* Erro que veio do servidor. Fica junto do botão porque é a resposta ao
            clique, e não a um campo específico — a mensagem é a mesma para
            e-mail inexistente e senha errada, de propósito. */}
        {error && (
          <p className="form__alert form__alert--error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="button button--primary"
          disabled={submitting}
        >
          {submitting ? 'Entrando…' : 'Login'}
        </button>

        <p className="login__separator">
          <span>ainda não tem conta?</span>
        </p>

        <button
          type="button"
          className="button button--ghost"
          onClick={onRegisterClick}
          disabled={submitting}
        >
          Registre-se
        </button>
      </form>
    </main>
  )
}
