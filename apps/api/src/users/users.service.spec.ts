import { Test } from '@nestjs/testing';
import { PASSWORD_HASHER } from './password-hasher.js';
import { EmailAlreadyInUseError } from './users.errors.js';
import { UsersRepository } from './users.repository.js';
import type { NewUser, StoredUser } from './users.repository.js';
import { UsersService } from './users.service.js';

/**
 * Regra de cadastro, testada sem banco e sem subir servidor: o repositório e o
 * hasher entram como dublês. O que está sob teste é o que o service decide —
 * normalizar a identidade e nunca deixar a senha chegar ao banco em texto puro.
 */

/** Guarda o que o service mandou gravar, para o teste inspecionar. */
function repositoryFake() {
  const saved: NewUser[] = [];

  return {
    saved,
    create(user: NewUser): Promise<StoredUser> {
      saved.push(user);
      return Promise.resolve({
        id: 'id-fixo-para-teste',
        name: user.name,
        email: user.email,
        createdAt: new Date('2026-10-18T12:00:00Z'),
      });
    },
  };
}

/**
 * Hash falso, mas com o mesmo contrato do real: entra texto puro, sai algo
 * diferente dele. Rodar bcrypt de verdade aqui só gastaria CPU sem testar regra.
 */
const hasherFake = {
  hash: (plainPassword: string) => Promise.resolve(`hash-de:${plainPassword}`),
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
