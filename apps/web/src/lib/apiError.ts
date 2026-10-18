/**
 * Leitura do corpo de erro da API.
 *
 * O formato é o do Nest: `message` é uma string nos erros de domínio (409, 401)
 * e um array de linhas quando o `ValidationPipe` reprova o payload. Esse
 * conhecimento fica em um lugar só — nasceu no cadastro e foi movido para cá
 * quando o login passou a precisar do mesmo tratamento.
 */
export function readApiErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined
  }

  const message: unknown = body.message

  if (typeof message === 'string') return message

  if (Array.isArray(message)) {
    const lines = message.filter(
      (item): item is string => typeof item === 'string',
    )
    if (lines.length > 0) return lines.join(' ')
  }

  return undefined
}
