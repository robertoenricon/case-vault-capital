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
}

/**
 * Tela de login
 */
export function LoginPage({ onSubmit, onRegisterClick }: LoginPageProps) {
  const [email, setEmail] = useState('')
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
