/**
 * Sessão de quem está logado, guardada no `localStorage`.
 *
 * Por que `localStorage`: o backend devolve um JWT e o front manda no header
 * `Authorization` — não há cookie de sessão. O preço é conhecido e aceito: o
 * token fica legível por JavaScript, então um XSS no front consegue roubá-lo.
 * A defesa aqui é não ter XSS (React escapa o que renderiza, e nada usa
 * `dangerouslySetInnerHTML`), não esconder o token.
 */

export type Session = {
  accessToken: string
  user: {
    id: string
    name: string
    email: string
  }
}

/** Prefixo no nome da chave para não colidir com outra coisa na mesma origem. */
const STORAGE_KEY = 'vault:session'

/**
 * Confere a forma de uma sessão vinda de fora — do `localStorage` (versão
 * anterior do app, ou alguém editando à mão) ou da resposta da API, que chega
 * como `any` do `json()`. Um `as Session` nos dois casos só adiaria o erro para
 * a renderização.
 *
 * Mora aqui, junto do tipo, e não em cada lugar que lê uma sessão: a forma da
 * `Session` é um conhecimento só.
 */
export function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  if (!('accessToken' in value) || typeof value.accessToken !== 'string') {
    return false
  }
  if (!('user' in value) || typeof value.user !== 'object' || value.user === null) {
    return false
  }

  const { user } = value

  return (
    'id' in user &&
    typeof user.id === 'string' &&
    'name' in user &&
    typeof user.name === 'string' &&
    'email' in user &&
    typeof user.email === 'string'
  )
}

/**
 * Sessão guardada, ou `undefined` quando não há nenhuma válida.
 *
 * O `try` cobre dois casos reais: JSON corrompido e navegador que proíbe
 * `localStorage` (modo privado com restrição, cookies bloqueados). Nos dois, o
 * app continua funcionando — só começa deslogado.
 */
export function loadSession(): Session | undefined {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return undefined

    const parsed: unknown = JSON.parse(stored)
    if (!isSession(parsed)) {
      // Formato desconhecido é lixo: apagar evita tentar de novo a cada abertura.
      window.localStorage.removeItem(STORAGE_KEY)
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

/** Guarda a sessão. Falha de escrita não derruba o login: a sessão em memória segue valendo. */
export function saveSession(session: Session): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Sem armazenamento disponível, a sessão vale só até fechar a aba.
  }
}

/**
 * Apaga a sessão local. É tudo o que "sair" faz hoje: o token continua válido
 * no servidor até expirar, porque não existe revogação (ver auth.module.ts).
 */
export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nada a fazer: se não dá para escrever, também não havia o que apagar.
  }
}
