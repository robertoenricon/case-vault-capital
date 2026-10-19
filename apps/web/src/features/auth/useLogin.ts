import { useRef, useState } from 'react'
import { login } from './loginApi'
import type { LoginCredentials } from './loginApi'
import type { Session } from './session'

type UseLoginResult = {
  /** Envia as credenciais. Chamadas durante um envio em andamento são ignoradas. */
  submit: (credentials: LoginCredentials) => Promise<void>
  submitting: boolean
  /** Mensagem do servidor (credencial errada, falha de rede). `undefined` = nada a mostrar. */
  error?: string
}

/**
 * Caso de uso "entrar" do ponto de vista da tela: dispara a requisição e expõe
 * carregando/erro. A página não sabe que existe `fetch`, nem o hook sabe como o
 * erro é desenhado.
 */
export function useLogin(
  onAuthenticated: (session: Session) => void,
): UseLoginResult {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  // O guard precisa ser um ref, não o estado: dois cliques no mesmo tick leriam
  // o mesmo `submitting` antigo e mandariam dois logins — e cada um custa um
  // bcrypt no servidor. O botão desabilitado é o aviso visual; isto é a trava.
  const inFlight = useRef(false)

  async function submit(credentials: LoginCredentials): Promise<void> {
    if (inFlight.current) return

    inFlight.current = true
    setSubmitting(true)
    setError(undefined)

    try {
      const session = await login(credentials)
      onAuthenticated(session)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível entrar agora. Tente novamente em instantes.',
      )
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return { submit, submitting, error }
}
