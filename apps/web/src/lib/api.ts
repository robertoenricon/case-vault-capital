/**
 * Endereço da API, lido do ambiente em build/dev pelo Vite — nunca escrito no
 * código, porque muda entre local e produção.
 *
 * A checagem acontece no carregamento do módulo, de propósito: sem a variável,
 * o app quebra na abertura com uma mensagem clara em vez de só na primeira
 * requisição, quando o rastro já é "falha ao buscar".
 */
const baseUrl = import.meta.env.VITE_API_URL

if (!baseUrl) {
  throw new Error(
    'VITE_API_URL não definida. Copie .env.example para .env na raiz antes de subir o front.',
  )
}

/** Monta a URL de um recurso da API. Recebe o caminho com a barra inicial: `/users`. */
export function apiUrl(path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}
