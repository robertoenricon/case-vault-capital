import { Test } from '@nestjs/testing';
import type { PublicUser } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';
import {
  LeagueStartsInPastError,
  NotALeagueParticipantError,
} from './leagues.errors.js';
import { LeaguesRepository } from './leagues.repository.js';
import type { NewLeague, StoredLeague } from './leagues.repository.js';
import { LeaguesService } from './leagues.service.js';

/**
 * Regras da criação e da listagem de ligas, sem banco e sem subir servidor: o
 * repositório entra como dublê. O que está sob teste é o que o service decide —
 * quem criou entra na liga, período inválido não grava nada, e a lista sai com
 * situação e na ordem que a tela espera.
 *
 * Os testes de criação usam fuso UTC e datas a partir de amanhã. Motivo: o
 * service chama `new Date()` (é onde o tempo entra no sistema), então fixar o
 * dia aqui deixaria o teste quebrando sozinho com o passar do tempo. A conta de
 * dia e instante é testada em league-period.spec.ts e a de situação em
 * league-status.spec.ts, onde o "agora" é parâmetro.
 */

const ID_FIXO = 'id-fixo-de-liga';
const CRIADOR = 'id-de-quem-criou';
const UTC = 0;
const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda o que o service mandou gravar e responde a listagem a partir disso.
 *
 * `seed` existe porque a criação recusa período no passado (e deve recusar):
 * para testar a lista com liga encerrada, é preciso simular linha que já está
 * no banco, como aconteceria com uma liga de semanas atrás.
 *
 * `findByParticipant` devolve tudo o que foi semeado e **registra por quem
 * perguntaram**: o filtro por participação é do banco (um `where`), não do
 * service. O que cabe testar aqui é se o service pede a lista da pessoa certa.
 */
function repositoryFake() {
  const saved: NewLeague[] = [];
  const askedFor: string[] = [];
  const rows: StoredLeague[] = [];
  const participantsByLeague = new Map<string, string[]>();

  return {
    saved,
    askedFor,

    seed(league: StoredLeague): void {
      rows.push(league);
    },

    create(league: NewLeague): Promise<StoredLeague> {
      saved.push(league);

      const row: StoredLeague = {
        id: ID_FIXO,
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
      };
      rows.push(row);

      return Promise.resolve(row);
    },

    findByParticipant(userId: string): Promise<StoredLeague[]> {
      askedFor.push(userId);

      return Promise.resolve([...rows]);
    },

    /** Quem participa de cada liga. Liga nunca semeada responde vazio, como o banco. */
    seedParticipants(leagueId: string, userIds: string[]): void {
      participantsByLeague.set(leagueId, userIds);
    },

    findParticipantUserIds(leagueId: string): Promise<string[]> {
      return Promise.resolve(participantsByLeague.get(leagueId) ?? []);
    },
  };
}

/**
 * Contas cadastradas, do ponto de vista do módulo de ligas: só o que o
 * `UsersService` expõe.
 *
 * `listedTimes` existe para um teste específico — o de que a base de usuários
 * não é consultada quando quem pede não participa da liga. Sem isso, "não
 * vazou" seria uma afirmação sobre o retorno, não sobre o acesso.
 */
function usersServiceFake(users: PublicUser[]) {
  const state = {
    listedTimes: 0,
    listPublic(): Promise<PublicUser[]> {
      state.listedTimes += 1;

      return Promise.resolve(users);
    },
  };

  return state;
}

async function buildService(
  repository: ReturnType<typeof repositoryFake>,
  users: ReturnType<typeof usersServiceFake> = usersServiceFake([]),
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LeaguesService,
      { provide: LeaguesRepository, useValue: repository },
      { provide: UsersService, useValue: users },
    ],
  }).compile();

  return moduleRef.get(LeaguesService);
}

/** `AAAA-MM-DD`, em UTC, a tantos dias de hoje. */
function diaEmUtc(daysFromNow: number): string {
  const instant = new Date(Date.now() + daysFromNow * DIA_EM_MS);
  const month = String(instant.getUTCMonth() + 1).padStart(2, '0');
  const day = String(instant.getUTCDate()).padStart(2, '0');

  return `${instant.getUTCFullYear()}-${month}-${day}`;
}

/** Linha de liga pronta, com período em dias relativos a agora. */
function ligaNoBanco(
  id: string,
  name: string,
  startDays: number,
  endDays: number,
): StoredLeague {
  return {
    id,
    name,
    startsAt: new Date(Date.now() + startDays * DIA_EM_MS),
    endsAt: new Date(Date.now() + endDays * DIA_EM_MS),
  };
}

describe('LeaguesService.create', () => {
  it('grava a liga com quem criou dentro dela', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    const created = await service.create({
      name: 'Liga dos Amigos',
      startDate: diaEmUtc(1),
      endDate: diaEmUtc(8),
      timeZoneOffsetMinutes: UTC,
      creatorId: CRIADOR,
    });

    // É o vínculo que o enunciado pede: a liga nasce com quem a criou dentro.
    // Sem isso, quem cria ficaria de fora da própria competição.
    expect(repository.saved[0]?.creatorId).toBe(CRIADOR);
    expect(created.id).toBe(ID_FIXO);
    expect(created.name).toBe('Liga dos Amigos');
  });

  it('converte o dia escolhido em instantes antes de gravar', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.create({
      name: 'Liga dos Amigos',
      startDate: diaEmUtc(1),
      endDate: diaEmUtc(1),
      timeZoneOffsetMinutes: UTC,
      creatorId: CRIADOR,
    });

    const saved = repository.saved[0];

    // O que chega ao banco é instante, não texto de data: quem decide a hora é
    // o servidor, não o cliente.
    expect(saved?.startsAt.toISOString()).toBe(`${diaEmUtc(1)}T00:00:00.000Z`);
    expect(saved?.endsAt.toISOString()).toBe(`${diaEmUtc(1)}T23:59:59.999Z`);
  });

  it('devolve a liga já com a situação calculada', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    const created = await service.create({
      name: 'Liga dos Amigos',
      startDate: diaEmUtc(1),
      endDate: diaEmUtc(8),
      timeZoneOffsetMinutes: UTC,
      creatorId: CRIADOR,
    });

    // Criar não é começar: liga marcada para amanhã nasce agendada. A tela
    // depende disso para não oferecer operação numa liga que não começou.
    expect(created.status).toBe('scheduled');
  });

  it('não grava nada quando o período é inválido', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await expect(
      service.create({
        name: 'Liga dos Amigos',
        startDate: diaEmUtc(-1),
        endDate: diaEmUtc(8),
        timeZoneOffsetMinutes: UTC,
        creatorId: CRIADOR,
      }),
    ).rejects.toThrow(LeagueStartsInPastError);

    // A regra roda antes de qualquer escrita: liga recusada não deixa rastro.
    expect(repository.saved).toHaveLength(0);
  });
});

describe('LeaguesService.listForParticipant', () => {
  it('pede ao banco as ligas de quem está perguntando', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.listForParticipant(CRIADOR);

    // Ninguém monta a lista de outra pessoa: o id vem do token, e o service
    // repassa esse e só esse.
    expect(repository.askedFor).toEqual([CRIADOR]);
  });

  it('calcula a situação de cada liga', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('3', 'Valendo agora', -1, 1));
    repository.seed(ligaNoBanco('2', 'Começa depois', 2, 3));
    repository.seed(ligaNoBanco('1', 'Já acabou', -5, -4));

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    const situacoes = new Map(leagues.map((l) => [l.name, l.status]));
    expect(situacoes.get('Valendo agora')).toBe('running');
    expect(situacoes.get('Começa depois')).toBe('scheduled');
    expect(situacoes.get('Já acabou')).toBe('finished');
  });

  it('ordena por situação: em andamento, agendada, encerrada', async () => {
    // Semeadas fora de ordem de propósito — é a ordenação que está sob teste.
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('1', 'Já acabou', -5, -4));
    repository.seed(ligaNoBanco('2', 'Começa depois', 2, 3));
    repository.seed(ligaNoBanco('3', 'Valendo agora', -1, 1));

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    expect(leagues.map((league) => league.name)).toEqual([
      'Valendo agora',
      'Começa depois',
      'Já acabou',
    ]);
  });

  it('dentro da mesma situação, a de início mais recente vem antes', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('1', 'Começou há três dias', -3, 5));
    repository.seed(ligaNoBanco('2', 'Começou ontem', -1, 5));

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    expect(leagues.map((league) => league.name)).toEqual([
      'Começou ontem',
      'Começou há três dias',
    ]);
  });

  it('desempata pela liga criada mais recentemente', async () => {
    // Mesmo período: sem desempate, a ordem seria a que o banco devolvesse.
    // O id é UUID v7, então o maior é o mais novo.
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('01a1-antiga', 'Criada antes', -1, 5));
    repository.seed(ligaNoBanco('01a2-nova', 'Criada depois', -1, 5));

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    expect(leagues.map((league) => league.name)).toEqual([
      'Criada depois',
      'Criada antes',
    ]);
  });

  it('devolve lista vazia quando a pessoa não participa de nenhuma liga', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    // Vazio é resposta normal, não erro: a tela tem estado próprio para isso.
    await expect(service.listForParticipant(CRIADOR)).resolves.toEqual([]);
  });
});

describe('LeaguesService.listCandidates', () => {
  const LIGA = 'id-da-liga';
  const OUTRA_PESSOA = 'id-de-outra-pessoa';

  const CADASTRADOS: PublicUser[] = [
    { id: CRIADOR, name: 'Ana Prado' },
    { id: 'id-do-bruno', name: 'Bruno Lima' },
    { id: 'id-da-carla', name: 'Carla Dias' },
  ];

  it('marca quem já participa da liga', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR, 'id-da-carla']);
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    const candidates = await service.listCandidates(LIGA, CRIADOR);

    // Quem já está dentro continua na lista, marcado: é o que diferencia "já
    // está na liga" de "não tem conta" para quem procura o amigo.
    const marcados = new Map(
      candidates.map((c) => [c.name, c.alreadyParticipant]),
    );
    expect(marcados.get('Carla Dias')).toBe(true);
    expect(marcados.get('Bruno Lima')).toBe(false);
  });

  it('não inclui quem está pedindo a lista', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR]);
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    const candidates = await service.listCandidates(LIGA, CRIADOR);

    // Ninguém se convida, e a pessoa já sabe que está dentro.
    expect(candidates.map((c) => c.name)).toEqual(['Bruno Lima', 'Carla Dias']);
  });

  it('preserva a ordem em que as contas vieram', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR]);
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    const candidates = await service.listCandidates(LIGA, CRIADOR);

    // A ordem alfabética vem da consulta de contas; o service não reordena.
    expect(candidates.map((c) => c.name)).toEqual(['Bruno Lima', 'Carla Dias']);
  });

  it('recusa quem não participa da liga', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR]);
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    await expect(
      service.listCandidates(LIGA, OUTRA_PESSOA),
    ).rejects.toThrow(NotALeagueParticipantError);
  });

  it('não consulta a base de usuários quando quem pede não participa', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR]);
    const users = usersServiceFake(CADASTRADOS);
    const service = await buildService(repository, users);

    await expect(
      service.listCandidates(LIGA, OUTRA_PESSOA),
    ).rejects.toThrow(NotALeagueParticipantError);

    // A autorização vem antes da leitura, não depois: a base de contas não é
    // nem tocada por quem está de fora.
    expect(users.listedTimes).toBe(0);
  });

  it('trata liga inexistente como liga de que a pessoa não participa', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    // Mesmo erro dos dois casos, de propósito: assim não se descobre a
    // existência de ligas alheias testando ids.
    await expect(
      service.listCandidates('liga-que-nao-existe', CRIADOR),
    ).rejects.toThrow(NotALeagueParticipantError);
  });
});
