import type { ReactNode } from 'react'

/**
 * Campo de formulário: rótulo, controle e a mensagem embaixo (erro ou dica).
 *
 * Nasceu dentro de RegisterPage.tsx e veio para cá — sem mudar comportamento —
 * quando o formulário de criar liga passou a precisar do mesmo campo. Mesmo
 * motivo pelo qual o CSS foi para authForm.css: a aparência e a ligação de
 * acessibilidade ficam definidas em um lugar só.
 *
 * O visual continua vindo de authForm.css; quem usa este componente importa
 * aquele CSS.
 */

type FieldProps = {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export function Field({ id, label, error, hint, children }: FieldProps) {
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
