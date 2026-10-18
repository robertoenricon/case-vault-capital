/**
 * Liga o input à mensagem que está sendo exibida embaixo dele — o `id` que vai
 * no `aria-describedby`. Erro tem prioridade sobre dica, porque é o erro que
 * está visível quando os dois existem (ver Field.tsx).
 *
 * Mora em arquivo próprio, e não junto do `Field`, por causa do Fast Refresh:
 * um módulo que exporta componente **e** função perde a atualização sem recarga
 * no desenvolvimento.
 */
export function describedBy(
  id: string,
  error?: string,
  hint?: string,
): string | undefined {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}
