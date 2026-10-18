import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  AccessTokenIssuer,
  AccessTokenPayload,
} from './access-token-issuer.js';

/**
 * Implementação concreta na borda: é o único arquivo do projeto que conhece o
 * @nestjs/jwt.
 *
 * Segredo e validade não aparecem aqui — vêm configurados no `JwtModule` (ver
 * auth.module.ts). Assim mudar a validade do token é mexer em um lugar só, e
 * esse lugar não é regra de negócio nem adaptador.
 */
@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  constructor(private readonly jwt: JwtService) {}

  issue(payload: AccessTokenPayload): Promise<string> {
    // `signAsync` e não `sign`: assinar é trabalho de CPU, e a versão síncrona
    // bloquearia o event loop no meio da requisição de login.
    return this.jwt.signAsync(payload);
  }
}
