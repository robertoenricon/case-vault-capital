import { Test } from '@nestjs/testing';
import { PASSWORD_HASHER } from './password-hasher.js';
import { EmailAlreadyInUseError } from './users.errors.js';
import { UsersRepository } from './users.repository.js';
import type {
  NewUser,
  StoredUser,
  UserCredentials,
} from './users.repository.js';
import { UsersService } from './users.service.js';

/**
 * Regras de conta, testadas sem banco e sem subir servidor: o repositório e o
 * hasher entram como dublês. O que está sob teste é o que o service decide —
 * normalizar a identidade, nunca deixar a senha chegar ao banco em texto puro e
 * conferir credencial sem dizer qual metade falhou.
 */

const ID_FIXO = 'id-fixo-para-teste';

/**
 * Guarda o que o service mandou gravar e responde a busca por e-mail a partir
 * disso — assim o teste pode cadastrar e, em seguida, tentar entrar.
 */
function repositoryFake() {
  const saved: NewUser[] = [];

  return {
    saved,
    create(user: NewUser): Promise<StoredUser> {
      saved.push(user);
      return Promise.resolve({
        id: ID_FIXO,
        name: user.name,
        email: user.email,
        createdAt: new Date('2026-10-18T12:00:00Z'),
      });
    },
    findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
      // Comparação byte a byte, como o UNIQUE do Postgres: se o service
      // esquecer de normalizar o e-mail, o teste reprova.
      const found = saved.find((user) => user.email === email);

      return Promise.resolve(
        found
          ? {
              id: ID_FIXO,
              name: found.name,
              email: found.email,
              passwordHash: found.passwordHash,
            }
          : null,
      );
    },
  };
}

/**
 * Hash falso, mas com o mesmo contrato do real: entra texto puro, sai algo
 * diferente dele, e o `compare` só aceita o par que combina. Rodar bcrypt de
 * verdade aqui só gastaria CPU sem testar regra nenhuma.
 */
const hasherFake = {
  hash: (plainPassword: string) => Promise.resolve(`hash-de:${plainPassword}`),
  compare: (plainPassword: string, passwordHash: string) =>
    Promise.resolve(passwordHash === `hash-de:${plainPassword}`),
};

async function buildService(repository: ReturnType<typeof repositoryFake>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: UsersRepository, useValue: repository },
      { provide: PASSWORD_HASHER, useValue: hasherFake },
    ],
  }).compile();

  return moduleRef.get(UsersService);
}

describe('UsersService.register', () => {
  it('normaliza o e-mail para minúsculas antes de gravar', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    const created = await service.register({
      name: 'Ana Prado',
      email: 'Ana.Prado@Mail.com',
      password: 'senha-secreta',
    });

    // Sem isso o UNIQUE do Postgres deixaria passar duas contas para a mesma pessoa.
    expect(repository.saved[0]?.email).toBe('ana.prado@mail.com');
    expect(created.email).toBe('ana.prado@mail.com');
  });

  it('preserva o nome como a pessoa digitou', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.register({
      name: 'Ana Prado',
      email: 'ana@mail.com',
      password: 'senha-secreta',
    });

    expect(repository.saved[0]?.name).toBe('Ana Prado');
  });

  it('grava o hash da senha, nunca a senha', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.register({
      name: 'Ana Prado',
      email: 'ana@mail.com',
      password: 'senha-secreta',
    });

    const saved = repository.saved[0];
    expect(saved?.passwordHash).toBe('hash-de:senha-secreta');
    expect(JSON.stringify(saved)).not.toContain('"senha-secreta"');
  });

  it('propaga o conflito de e-mail já cadastrado', async () => {
    const repository = repositoryFake();
    repository.create = () =>
      Promise.reject(new EmailAlreadyInUseError('ana@mail.com'));
    const service = await buildService(repository);

    // O service não engole nem reempacota: quem traduz para 409 é o filtro HTTP.
    await expect(
      service.register({
        name: 'Ana Prado',
        email: 'ana@mail.com',
        password: 'senha-secreta',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });
});

describe('UsersService.verifyCredentials', () => {
  /** Cadastra a Ana e devolve o service pronto para as tentativas de login. */
  async function comContaCadastrada() {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.register({
      name: 'Ana Prado',
      email: 'ana@mail.com',
      password: 'senha-secreta',
    });

    return service;
  }

  it('devolve a identidade da conta quando a senha está correta', async () => {
    const service = await comContaCadastrada();

    const account = await service.verifyCredentials(
      'ana@mail.com',
      'senha-secreta',
    );

    expect(account).toEqual({
      id: ID_FIXO,
      name: 'Ana Prado',
      email: 'ana@mail.com',
    });
  });

  it('nunca devolve o hash da senha para quem chamou', async () => {
    const service = await comContaCadastrada();

    const account = await service.verifyCredentials(
      'ana@mail.com',
      'senha-secreta',
    );

    // O hash existe no banco e é usado na comparação, mas para aqui.
    expect(JSON.stringify(account)).not.toContain('hash-de:');
  });

  it('aceita o e-mail digitado em qualquer caixa', async () => {
    const service = await comContaCadastrada();

    // Quem se cadastrou como "ana@mail.com" tem que entrar digitando
    // "Ana@Mail.com": é a mesma identidade, e foi normalizada no cadastro.
    const account = await service.verifyCredentials(
      'Ana@Mail.com',
      'senha-secreta',
    );

    expect(account?.id).toBe(ID_FIXO);
  });

  it('devolve null quando a senha está errada', async () => {
    const service = await comContaCadastrada();

    expect(
      await service.verifyCredentials('ana@mail.com', 'senha-errada'),
    ).toBeNull();
  });

  it('devolve null quando não existe conta com o e-mail', async () => {
    const service = await comContaCadastrada();

    // Mesmo retorno da senha errada, de propósito: é o que impede o login de
    // responder diferente nos dois casos e revelar quais e-mails têm conta.
    expect(
      await service.verifyCredentials('ninguem@mail.com', 'senha-secreta'),
    ).toBeNull();
  });
});
