import type { AccessTokenPayload } from './access-token-issuer.js';

/**
 * Contrato de verificação do token de acesso.
 *
 * É um contrato separado do de emissão (access-token-issuer.ts), e não um
 * método a mais nele, de propósito: o login só emite e o guard só verifica.
 * Juntar os dois faria cada consumidor depender de um método que nunca chama —
 * e o dublê de teste do login teria que fingir saber verificar token.
 *
 * Quem implementa fica na borda e é o único a conhecer a lib de JWT; a decisão
 * de o que fazer com um token inválido é de quem consome.
 */
export interface AccessTokenVerifier {
  /**
   * Devolve o conteúdo do token, ou `null` quando ele não vale — assinatura
   * errada, expirado, adulterado ou nem sendo um JWT.
   *
   * `null` em vez de exceção, e um único `null` para todas as causas: o
   * chamador não tem o que decidir a partir da causa, e distinguir "expirou" de
   * "assinatura inválida" só ajudaria quem está tentando forjar um token.
   * Qualquer implementação precisa honrar isso, inclusive os dublês de teste.
   */
  verify(token: string): Promise<AccessTokenPayload | null>;
}

/** Token de injeção: interface não existe em runtime, então o Nest precisa de um símbolo. */
export const ACCESS_TOKEN_VERIFIER = Symbol('AccessTokenVerifier');
