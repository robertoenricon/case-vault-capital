import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { ACCESS_TOKEN_ISSUER } from './access-token-issuer.js';
import { ACCESS_TOKEN_VERIFIER } from './access-token-verifier.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer.js';
import { JwtAccessTokenVerifier } from './jwt-access-token-verifier.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * Validade do token: 7 dias.
 *
 * Uma liga entre amigos dura dias e ninguém quer logar de novo a cada visita.
 * Preço assumido: não existe refresh token nem revogação no servidor, então um
 * token vazado vale por uma semana e um "sair" só apaga o que está no navegador.
 * Revogar de verdade exigiria lista de bloqueio com estado no servidor — fora do
 * escopo deste MVP.
 */
const ACCESS_TOKEN_TTL = '7d';

/**
 * Segredo da assinatura. Sem ele a aplicação não sobe: falhar no boot é melhor
 * do que subir e só quebrar na primeira tentativa de login — ou, pior, assinar
 * token com segredo vazio.
 *
 * Roda na avaliação do módulo, antes de qualquer requisição existir.
 */
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET não definida. Copie .env.example para .env antes de subir a API.',
    );
  }

  return secret;
}

/**
 * Sessão de acesso. Depende de `users` (quem confere a senha) e da lib de JWT.
 *
 * Segredo e validade são configurados aqui, um nível acima do adaptador: o
 * emissor assina, este módulo decide com o quê e por quanto tempo.
 *
 * Exporta o guard e o verificador — e só eles — para que módulos de domínio
 * protejam as próprias rotas sem conhecer JWT nem o segredo. O `AuthService`
 * continua privado: outro módulo não tem por que emitir token.
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: ACCESS_TOKEN_TTL },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: ACCESS_TOKEN_ISSUER, useClass: JwtAccessTokenIssuer },
    { provide: ACCESS_TOKEN_VERIFIER, useClass: JwtAccessTokenVerifier },
    JwtAuthGuard,
  ],
  exports: [ACCESS_TOKEN_VERIFIER, JwtAuthGuard],
})
export class AuthModule {}
