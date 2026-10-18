import { Test } from '@nestjs/testing';
import { UsersService } from '../users/users.service.js';
import type { UserAccount } from '../users/users.service.js';
import { ACCESS_TOKEN_ISSUER } from './access-token-issuer.js';
import type { AccessTokenPayload } from './access-token-issuer.js';
import { AuthService } from './auth.service.js';
import { InvalidCredentialsError } from './auth.errors.js';

/**
 * Regra de login, testada sem banco, sem servidor e sem segredo de JWT: a
 * conferência de senha e a emissão do token entram como dublês.
 *
 * O que está sob teste é o que o service decide — credencial inválida não entra,
 * e quem entra recebe um token assinado com o id da própria conta.
 */

const CONTA: UserAccount = {
  id: 'id-fixo-para-teste',
  name: 'Ana Prado',
  email: 'ana@mail.com',
};

/**
 * Faz o papel do `UsersService`: devolve a conta quando a senha é a esperada e
 * `null` em qualquer outro caso — mesmo contrato do real, que não distingue
 * e-mail inexistente de senha errada.
 */
function usersFake(senhaCorreta?: string) {
  return {
    verifyCredentials(email: string, password: string) {
      const acertou =
        senhaCorreta !== undefined &&
        email.toLowerCase() === CONTA.email &&
        password === senhaCorreta;

      return Promise.resolve(acertou ? CONTA : null);
    },
  };
}

/** Guarda o que foi assinado, para o teste inspecionar o payload. */
function issuerFake() {
  const issued: AccessTokenPayload[] = [];

  return {
    issued,
    issue(payload: AccessTokenPayload): Promise<string> {
      issued.push(payload);
      return Promise.resolve(`token-de:${payload.sub}`);
    },
  };
}

/**
 * Executa um login que **deve** falhar e devolve o erro já tipado. Sem isto, o
 * `catch` devolveria `InvalidCredentialsError | LoginResult` e o teste precisaria
 * de um `as` para ler a mensagem — exatamente o atalho que esconde um login que
 * passou quando devia ter falhado.
 */
async function loginFailure(
  service: AuthService,
  credentials: { email: string; password: string },
): Promise<InvalidCredentialsError> {
  try {
    await service.login(credentials);
  } catch (failure) {
    if (failure instanceof InvalidCredentialsError) return failure;
    throw failure;
  }

  throw new Error('O login devia ter falhado, mas foi aceito.');
}

async function buildService(
  users: ReturnType<typeof usersFake>,
  issuer: ReturnType<typeof issuerFake>,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useValue: users },
      { provide: ACCESS_TOKEN_ISSUER, useValue: issuer },
    ],
  }).compile();

  return moduleRef.get(AuthService);
}

describe('AuthService.login', () => {
  it('emite token com o id da conta quando a senha está correta', async () => {
    const issuer = issuerFake();
    const service = await buildService(usersFake('senha-secreta'), issuer);

    const result = await service.login({
      email: 'ana@mail.com',
      password: 'senha-secreta',
    });

    // O token carrega o id, não o e-mail: qualquer um lê o payload de um JWT.
    expect(issuer.issued).toEqual([{ sub: CONTA.id }]);
    expect(result.accessToken).toBe('token-de:id-fixo-para-teste');
    expect(result.user).toEqual(CONTA);
  });

  it('recusa senha errada sem emitir token', async () => {
    const issuer = issuerFake();
    const service = await buildService(usersFake('senha-secreta'), issuer);

    await expect(
      service.login({ email: 'ana@mail.com', password: 'senha-errada' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(issuer.issued).toHaveLength(0);
  });

  it('recusa e-mail inexistente sem emitir token', async () => {
    const issuer = issuerFake();
    const service = await buildService(usersFake(), issuer);

    await expect(
      service.login({ email: 'ninguem@mail.com', password: 'senha-secreta' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(issuer.issued).toHaveLength(0);
  });

  it('responde a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const semConta = await buildService(usersFake(), issuerFake());
    const comConta = await buildService(
      usersFake('senha-secreta'),
      issuerFake(),
    );

    const erroSemConta = await loginFailure(semConta, {
      email: 'ninguem@mail.com',
      password: 'qualquer-senha',
    });
    const erroSenhaErrada = await loginFailure(comConta, {
      email: 'ana@mail.com',
      password: 'senha-errada',
    });

    // É isto que impede o login de virar uma forma de descobrir quem tem conta.
    expect(erroSemConta.publicMessage).toBe(erroSenhaErrada.publicMessage);
  });

  it('não expõe a senha tentada na mensagem pública do erro', async () => {
    const service = await buildService(usersFake('senha-secreta'), issuerFake());

    const failure = await loginFailure(service, {
      email: 'ana@mail.com',
      password: 'senha-errada',
    });

    expect(failure.publicMessage).not.toContain('senha-errada');
    expect(failure.publicMessage).toBe('E-mail ou senha incorretos.');
  });
});
