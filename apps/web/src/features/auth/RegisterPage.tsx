import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  EMPTY_REGISTER_VALUES,
  REGISTER_RULES,
  hasErrors,
  toRegisterData,
  validateRegisterForm,
} from './registerValidation'
import type {
  RegisterFieldName,
  RegisterFormValues,
} from './registerValidation'
import { useRegister } from './useRegister'
import type { RegisteredUser } from './registerApi'
import './authForm.css'
import './RegisterPage.css'

type RegisterPageProps = {
  /** Chamado quando a conta já existe no banco, com o que a API devolveu. */
  onRegistered: (user: RegisteredUser) => void
  onLoginClick: () => void
}

type FieldProps = {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

/**
 * Componente que encapsula um campo do formulário, incluindo rótulo, input e mensagens de erro ou dica.
 */
function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      {children}

      {/* `role="alert"` para o leitor de tela anunciar o erro no momento em que ele aparece. */}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** Liga o input à mensagem que está sendo exibida embaixo dele (erro tem prioridade). */
function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

/**
 * Componente da página de registro, incluindo o formulário e a lógica de validação de cliente.
 */
export function RegisterPage({ onRegistered, onLoginClick }: RegisterPageProps) {
  // A requisição e seus estados moram no hook; aqui só se decide o que mostrar.
  const { submit, submitting, error: requestError } = useRegister(onRegistered)

  const [values, setValues] =
    useState<RegisterFormValues>(EMPTY_REGISTER_VALUES)
  const [touched, setTouched] = useState<
    Partial<Record<RegisterFieldName, boolean>>
  >({})
  
  const [submitTried, setSubmitTried] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)

  const errors = validateRegisterForm(values)

  // Erro aparece só depois de o campo ser tocado, ou depois de uma tentativa de envio.
  function visibleError(field: RegisterFieldName) {
    return submitTried || touched[field] ? errors[field] : undefined
  }

  function handleChange(field: RegisterFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function handleBlur(field: RegisterFieldName) {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitTried(true)

    // Validação do cliente é só para dar resposta imediata: o backend valida
    // tudo de novo, e é dele que vem a palavra final.
    if (hasErrors(errors)) return

    void submit(toRegisterData(values))
  }

  const nameError = visibleError('name')
  const emailError = visibleError('email')
  const passwordError = visibleError('password')
  const passwordConfirmationError = visibleError('passwordConfirmation')
  const passwordHint = `Ao menos ${REGISTER_RULES.password.minLength} caracteres.`

  return (
    <main className="register">
      <form className="register__card" onSubmit={handleSubmit} noValidate>
        <header className="register__header">
          <p className="register__brand">Case Vault Capital</p>
          <h1 className="register__title">Criar conta</h1>
          <p className="register__subtitle">
            Crie sua conta para entrar nas ligas e começar a operar.
          </p>
        </header>

        <Field id="name" label="Nome" error={nameError}>
          <input
            className="field__input"
            id="name"
            name="name"
            type="text"
            value={values.name}
            onChange={(event) => handleChange('name', event.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder="Como você aparece no ranking"
            autoComplete="name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy('name', nameError)}
            required
          />
        </Field>

        <Field id="email" label="E-mail" error={emailError}>
          <input
            className="field__input"
            id="email"
            name="email"
            type="email"
            value={values.email}
            onChange={(event) => handleChange('email', event.target.value)}
            onBlur={() => handleBlur('email')}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={describedBy('email', emailError)}
            required
          />
        </Field>

        <Field id="password" label="Senha" error={passwordError} hint={passwordHint}>
          <div className="field__control">
            <input
              className="field__input field__input--with-control"
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              value={values.password}
              onChange={(event) => handleChange('password', event.target.value)}
              onBlur={() => handleBlur('password')}
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={describedBy(
                'password',
                passwordError,
                passwordHint,
              )}
              required
            />
            <button
              type="button"
              className="field__reveal"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? 'Ocultar a senha' : 'Mostrar a senha'}
            >
              {passwordVisible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </Field>

        <Field id="passwordConfirmation" label="Confirmar senha" error={passwordConfirmationError}>
          <div className="field__control">
            <input
              className="field__input field__input--with-control"
              id="passwordConfirmation"
              name="passwordConfirmation"
              type={confirmationVisible ? 'text' : 'password'}
              value={values.passwordConfirmation}
              onChange={(event) =>
                handleChange('passwordConfirmation', event.target.value)
              }
              onBlur={() => handleBlur('passwordConfirmation')}
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={passwordConfirmationError ? true : undefined}
              aria-describedby={describedBy(
                'passwordConfirmation',
                passwordConfirmationError,
              )}
              required
            />
            <button
              type="button"
              className="field__reveal"
              onClick={() => setConfirmationVisible((visible) => !visible)}
              aria-label={
                confirmationVisible
                  ? 'Ocultar a confirmação da senha'
                  : 'Mostrar a confirmação da senha'
              }
            >
              {confirmationVisible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </Field>

        {/* Erro que veio do servidor (e-mail em uso, API fora do ar). Fica junto
            do botão porque é a resposta ao clique, não a um campo específico. */}
        {requestError && (
          <p className="form__alert form__alert--error" role="alert">
            {requestError}
          </p>
        )}

        <button
          type="submit"
          className="button button--primary"
          disabled={submitting}
        >
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </button>

        <p className="register__separator">
          <span>já tem conta?</span>
        </p>

        <button
          type="button"
          className="button button--ghost"
          onClick={onLoginClick}
        >
          Entrar
        </button>
      </form>
    </main>
  )
}
