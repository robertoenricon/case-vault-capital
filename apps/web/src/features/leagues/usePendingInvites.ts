import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptInvite,
  listPendingInvites,
  rejectInvite,
} from './invitesApi'
import type { PendingInvite } from './invitesApi'
import type { League } from './leaguesApi'

type UsePendingInvitesResult = {
  /** `undefined` enquanto a primeira busca não terminou — diferente de `[]`, que é "nenhum convite". */
  invites?: PendingInvite[]
  /** Erro da busca **ou** da resposta ao convite. `undefined` = nada a mostrar. */
  error?: string
  /** `true` enquanto um aceite ou uma recusa está em voo: a tela desabilita os botões. */
  responding: boolean
  /** Aceita o convite e devolve a liga em que a pessoa entrou. */
  accept: (inviteId: string) => Promise<League | undefined>
  /** Recusa o convite. */
  reject: (inviteId: string) => Promise<void>
}

const GENERIC_FAILURE =
  'Não foi possível responder ao convite agora. Tente novamente em instantes.'

/**
 * Convites pendentes de quem está logado, com as duas ações sobre eles.
 *
 * Busca e ações ficam no mesmo hook porque são o mesmo estado: responder a um
 * convite muda a lista, e a lista é relida da API em vez de editada na memória
 * — assim não existem duas versões da verdade para divergirem.
 *
 * Não tem `loading` próprio: o bloco de convites só aparece quando há convite,
 * então não há o que mostrar enquanto a busca corre. É diferente da lista de
 * ligas, que é o conteúdo principal da tela e precisa do "carregando".
 */
export function usePendingInvites(
  accessToken: string,
): UsePendingInvitesResult {
  const [invites, setInvites] = useState<PendingInvite[]>()
  const [error, setError] = useState<string>()
  const [responding, setResponding] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  // O guard é um ref, não o estado: dois cliques no mesmo tick leriam o mesmo
  // `responding` antigo e disparariam duas respostas para o mesmo convite. Os
  // botões desabilitados são o aviso visual; isto é a trava.
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    listPendingInvites(accessToken, controller.signal)
      .then(setInvites)
      .catch((failure: unknown) => {
        // Busca cancelada não é falha: a tela saiu do ar, ou já existe uma
        // busca mais nova. O StrictMode monta duas vezes em desenvolvimento.
        if (controller.signal.aborted) return

        setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)
      })

    return () => controller.abort()
  }, [accessToken, reloadCount])

  const refresh = useCallback(() => {
    setError(undefined)
    setReloadCount((count) => count + 1)
  }, [])

  /**
   * Parte comum do aceite e da recusa: a trava de clique duplo, o erro na tela
   * e a releitura da lista. O que muda entre os dois é só a chamada à API.
   */
  const respond = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      if (inFlight.current) return undefined

      inFlight.current = true
      setResponding(true)
      setError(undefined)

      try {
        const result = await action()
        // A lista vem da API de novo, em vez de remover o convite na mão.
        refresh()

        return result
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : GENERIC_FAILURE)

        // A lista é relida também no erro: "convite não encontrado" significa
        // que ele não está mais lá, e deixá-lo na tela convidaria a tentar de novo.
        refresh()

        return undefined
      } finally {
        inFlight.current = false
        setResponding(false)
      }
    },
    [refresh],
  )

  const accept = useCallback(
    (inviteId: string) => respond(() => acceptInvite(inviteId, accessToken)),
    [accessToken, respond],
  )

  const reject = useCallback(
    async (inviteId: string) => {
      await respond(() => rejectInvite(inviteId, accessToken))
    },
    [accessToken, respond],
  )

  return { invites, error, responding, accept, reject }
}
