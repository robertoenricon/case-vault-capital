import { useRef, useState } from 'react'
import { createLeague } from './createLeagueApi'
import type { League } from './leaguesApi'
import type { CreateLeagueData } from './createLeagueValidation'

type UseCreateLeagueResult = {
  /** Envia a liga. Chamadas durante um envio em andamento são ignoradas. */
  submit: (data: CreateLeagueData) => Promise<void>
  submitting: boolean
  /** Mensagem do servidor (regra de período, sessão expirada, rede). `undefined` = nada a mostrar. */
  error?: string
}

/**
 * Caso de uso "criar liga" do ponto de vista da tela: dispara a requisição e
 * expõe carregando/erro. O modal não sabe que existe `fetch`, nem o hook sabe
 * como o erro é desenhado.
 */
export function useCreateLeague(
  accessToken: string,
  onCreated: (league: League) => void,
): UseCreateLeagueResult {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  // O guard precisa ser um ref, não o estado: dois cliques no mesmo tick leriam
  // o mesmo `submitting` antigo e criariam **duas ligas**. O botão desabilitado
  // é o aviso visual; isto é a trava.
  const inFlight = useRef(false)

  async function submit(data: CreateLeagueData): Promise<void> {
    if (inFlight.current) return

    inFlight.current = true
    setSubmitting(true)
    setError(undefined)

    try {
      const league = await createLeague(data, accessToken)
      onCreated(league)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível criar a liga agora. Tente novamente em instantes.',
      )
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return { submit, submitting, error }
}
