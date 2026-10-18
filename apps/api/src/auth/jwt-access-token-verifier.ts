import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from './access-token-issuer.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';

/**
 * Implementação concreta da verificação, na borda — par do
 * `JwtAccessTokenVerifier` com o `JwtAccessTokenIssuer`: estes dois são os
 * únicos arquivos do projeto que conhecem o @nestjs/jwt.
 *
 * O segredo não aparece aqui: vem configurado no `JwtModule` (ver
 * auth.module.ts), o mesmo que assinou.
 */
@Injectable()
export class JwtAccessTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      // `verifyAsync` e não `verify`: conferir assinatura é trabalho de CPU, e
      // a versão síncrona bloquearia o event loop em toda requisição autenticada.
      //
      // O tipo do payload é `Record<string, unknown>` e não `AccessTokenPayload`
      // de propósito: a lib confere assinatura e expiração, não a forma do
      // conteúdo. Anotar o tipo que eu espero aqui seria só promessa — a
      // garantia vem da checagem abaixo.
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
      );

      // Token assinado com este segredo mas sem `sub` passaria pela verificação
      // da lib e chegaria ao guard sem identidade nenhuma.
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        return null;
      }

      // Devolve só o que o contrato promete: o resto do payload (iat, exp) não
      // atravessa para dentro da aplicação.
      return { sub: payload.sub };
    } catch {
      // Expirado, assinatura inválida, texto que não é JWT: tudo vira o mesmo
      // `null`, como o contrato exige. O `catch` é vazio em efeito, mas não em
      // intenção — o valor de retorno é o tratamento.
      return null;
    }
  }
}
