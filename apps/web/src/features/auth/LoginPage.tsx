import { useState } from 'react'
import type { FormEvent } from 'react'
import './authForm.css'
import './LoginPage.css'

export type LoginCredentials = {
  email: string
  password: string
}

type LoginPageProps = {
  onSubmit: (credentials: LoginCredentials) => void
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
  onSubmit,
  onRegisterClick,
  notice,
  initialEmail,
}: LoginPageProps) {
  // Valor inicial, não estado espelhado: a partir daqui quem manda no campo é
  // quem está digitando, e a tela é montada de novo quando vem do cadastro.
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ email, password })
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

        <button type="submit" className="button button--primary">
          Login
        </button>

        <p className="login__separator">
          <span>ainda não tem conta?</span>
        </p>

        <button
          type="button"
          className="button button--ghost"
          onClick={onRegisterClick}
        >
          Registre-se
        </button>
      </form>
    </main>
  )
}
