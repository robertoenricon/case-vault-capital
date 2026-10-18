import { useRef, useState } from 'react'
import { registerUser } from './registerApi'
import type { RegisteredUser } from './registerApi'
import type { RegisterData } from './registerValidation'

type UseRegisterResult = {
  /** Envia o cadastro. Chamadas durante um envio em andamento são ignoradas. */
  submit: (data: RegisterData) => Promise<void>
  submitting: boolean
  /** Mensagem do servidor (e-mail em uso, falha de rede). `undefined` = nada a mostrar. */
  error?: string
}

/**
 * Caso de uso "criar conta" do ponto de vista da tela: dispara a requisição e
 * expõe carregando/erro. A página não sabe que existe `fetch`, nem o hook sabe
 * como o erro é desenhado.
 */
export function useRegister(
  onRegistered: (user: RegisteredUser) => void,
): UseRegisterResult {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  // O guard precisa ser um ref, não o estado: dois cliques no mesmo tick leriam
  // o mesmo `submitting` antigo e mandariam dois cadastros. O botão desabilitado
  // é o aviso visual; isto é a trava de verdade.
  const inFlight = useRef(false)

  async function submit(data: RegisterData): Promise<void> {
    if (inFlight.current) return

    inFlight.current = true
    setSubmitting(true)
    setError(undefined)

    try {
      const user = await registerUser(data)
      onRegistered(user)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível criar sua conta agora. Tente novamente em instantes.',
      )
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return { submit, submitting, error }
}
