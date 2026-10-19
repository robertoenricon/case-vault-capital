/**
 * Endereço da API, lido do ambiente em build/dev pelo Vite — nunca escrito no
 * código, porque muda entre local e produção.
 *
 * Validar ao montar a requisição permite publicar as telas antes da API.
 * Sem a URL, as chamadas seguem o tratamento de erro da funcionalidade.
 */
const baseUrl = import.meta.env.VITE_API_URL

/** Monta a URL de um recurso da API. Recebe o caminho com a barra inicial: `/users`. */
export function apiUrl(path: string): string {
  if (!baseUrl) {
    throw new Error(
      'VITE_API_URL não definida. Configure a URL da API no ambiente de build do front.',
    )
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`
}
