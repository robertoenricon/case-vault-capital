import { Test } from '@nestjs/testing';
import type { PublicUser } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';
import {
  LeagueAlreadyFinishedError,
  LeagueInviteAlreadySentError,
  LeagueInviteNotFoundError,
  LeagueStartsInPastError,
  NotALeagueParticipantError,
  UserAlreadyInLeagueError,
} from './leagues.errors.js';
import { LeaguesRepository } from './leagues.repository.js';
import type {
  NewLeague,
  StoredInvite,
  StoredLeague,
} from './leagues.repository.js';
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

  /** Convites pendentes, como as linhas da tabela. */
  const invites: { id: string; leagueId: string; invitedUserId: string }[] = [];

  /** Monta o que o repositório real devolve: o convite já com o join da liga. */
  function toStoredInvite(invite: {
    id: string;
    leagueId: string;
  }): StoredInvite | null {
    const league = rows.find((row) => row.id === invite.leagueId);
    if (!league) return null;

    return {
      id: invite.id,
      leagueId: league.id,
      leagueName: league.name,
      startsAt: league.startsAt,
      endsAt: league.endsAt,
    };
  }

  return {
    saved,
    askedFor,
    invites,

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

    findById(leagueId: string): Promise<StoredLeague | null> {
      return Promise.resolve(rows.find((row) => row.id === leagueId) ?? null);
    },

    /** Convite já pendente no banco, como se outra pessoa o tivesse enviado. */
    seedInvite(id: string, leagueId: string, invitedUserId: string): void {
      invites.push({ id, leagueId, invitedUserId });
    },

    findInvitedUserIds(leagueId: string): Promise<string[]> {
      return Promise.resolve(
        invites
          .filter((invite) => invite.leagueId === leagueId)
          .map((invite) => invite.invitedUserId),
      );
    },

    /**
     * Honra o contrato do real **inclusive no erro**: convite repetido lança
     * `LeagueInviteAlreadySentError`, como o índice único do banco provoca. Um
     * fake que aceitasse duplicata faria o teste passar e a produção responder
     * 409 sem ninguém esperar.
     */
    createInvite(leagueId: string, invitedUserId: string): Promise<void> {
      const duplicado = invites.some(
        (invite) =>
          invite.leagueId === leagueId &&
          invite.invitedUserId === invitedUserId,
      );

      if (duplicado) {
        return Promise.reject(
          new LeagueInviteAlreadySentError(leagueId, invitedUserId),
        );
      }

      invites.push({
        id: `convite-de-${invitedUserId}`,
        leagueId,
        invitedUserId,
      });

      return Promise.resolve();
    },

    findPendingInvitesForUser(userId: string): Promise<StoredInvite[]> {
      const found = invites
        .filter((invite) => invite.invitedUserId === userId)
        .map(toStoredInvite)
        .filter((invite): invite is StoredInvite => invite !== null);

      return Promise.resolve(found);
    },

    findInviteForUser(
      inviteId: string,
      userId: string,
    ): Promise<StoredInvite | null> {
      const found = invites.find(
        (invite) => invite.id === inviteId && invite.invitedUserId === userId,
      );

      return Promise.resolve(found ? toStoredInvite(found) : null);
    },

    /**
     * Reproduz a escrita condicional do real: só consome o convite se ele ainda
     * é desta pessoa **e** a liga não encerrou. Devolver sempre `true` aqui
     * esconderia a corrida que o service traduz em erro.
     */
    consumeInvite(
      invite: { id: string; leagueId: string },
      userId: string,
      notFinishedAt: Date,
    ): Promise<boolean> {
      const index = invites.findIndex(
        (row) => row.id === invite.id && row.invitedUserId === userId,
      );
      if (index === -1) return Promise.resolve(false);

      const league = rows.find((row) => row.id === invite.leagueId);
      if (!league || league.endsAt.getTime() < notFinishedAt.getTime()) {
        return Promise.resolve(false);
      }

      invites.splice(index, 1);
      participantsByLeague.set(invite.leagueId, [
        ...(participantsByLeague.get(invite.leagueId) ?? []),
        userId,
      ]);

      return Promise.resolve(true);
    },

    deleteInviteForUser(inviteId: string, userId: string): Promise<boolean> {
      const index = invites.findIndex(
        (invite) => invite.id === inviteId && invite.invitedUserId === userId,
      );
      if (index === -1) return Promise.resolve(false);

      invites.splice(index, 1);

      return Promise.resolve(true);
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

  it('marca quem já tem convite pendente', async () => {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR]);
    repository.seedInvite('convite-1', LIGA, 'id-do-bruno');
    const service = await buildService(repository, usersServiceFake(CADASTRADOS));

    const candidates = await service.listCandidates(LIGA, CRIADOR);

    // Sem esta marca a tela ofereceria "Convidar" de novo e o clique voltaria
    // com 409 do índice único.
    const pendentes = new Map(
      candidates.map((c) => [c.name, c.invitePending]),
    );
    expect(pendentes.get('Bruno Lima')).toBe(true);
    expect(pendentes.get('Carla Dias')).toBe(false);
  });
});

describe('LeaguesService.invite', () => {
  const LIGA = 'id-da-liga';
  const CONVIDADO = 'id-do-convidado';
  const DE_FORA = 'id-de-quem-esta-fora';

  /** Liga em andamento, com o criador dentro — o cenário comum do convite. */
  function comLigaEmAndamento() {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedParticipants(LIGA, [CRIADOR]);

    return repository;
  }

  it('grava o convite quando quem convida participa da liga', async () => {
    const repository = comLigaEmAndamento();
    const service = await buildService(repository);

    await service.invite(LIGA, CONVIDADO, CRIADOR);

    expect(repository.invites).toEqual([
      { id: `convite-de-${CONVIDADO}`, leagueId: LIGA, invitedUserId: CONVIDADO },
    ]);
  });

  it('recusa quem não participa da liga, sem gravar nada', async () => {
    const repository = comLigaEmAndamento();
    const service = await buildService(repository);

    // A liga não tem dono: qualquer participante convida. Mas quem está fora
    // não convida ninguém — é a mesma autorização da lista de candidatos.
    await expect(service.invite(LIGA, CONVIDADO, DE_FORA)).rejects.toThrow(
      NotALeagueParticipantError,
    );
    expect(repository.invites).toHaveLength(0);
  });

  it('recusa convidar quem já participa', async () => {
    const repository = comLigaEmAndamento();
    repository.seedParticipants(LIGA, [CRIADOR, CONVIDADO]);
    const service = await buildService(repository);

    await expect(service.invite(LIGA, CONVIDADO, CRIADOR)).rejects.toThrow(
      UserAlreadyInLeagueError,
    );
  });

  it('recusa convidar a si mesmo', async () => {
    const repository = comLigaEmAndamento();
    const service = await buildService(repository);

    // Cai no mesmo caso acima: quem convida participa, então convidar-se é
    // convidar alguém que já está dentro. Não precisa de regra própria.
    await expect(service.invite(LIGA, CRIADOR, CRIADOR)).rejects.toThrow(
      UserAlreadyInLeagueError,
    );
  });

  it('recusa convite para liga encerrada', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Já acabou', -5, -4));
    repository.seedParticipants(LIGA, [CRIADOR]);
    const service = await buildService(repository);

    // Convite que já nasce impossível de aceitar não deve ser criado.
    await expect(service.invite(LIGA, CONVIDADO, CRIADOR)).rejects.toThrow(
      LeagueAlreadyFinishedError,
    );
    expect(repository.invites).toHaveLength(0);
  });

  it('propaga o conflito de convite duplicado', async () => {
    const repository = comLigaEmAndamento();
    const service = await buildService(repository);

    await service.invite(LIGA, CONVIDADO, CRIADOR);

    // Quem detecta é o índice único, não uma verificação prévia no service: o
    // erro sobe do repositório e o filtro HTTP o traduz em 409.
    await expect(service.invite(LIGA, CONVIDADO, CRIADOR)).rejects.toThrow(
      LeagueInviteAlreadySentError,
    );
    expect(repository.invites).toHaveLength(1);
  });
});

describe('LeaguesService.listPendingInvites', () => {
  const LIGA = 'id-da-liga';
  const CONVIDADO = 'id-do-convidado';

  it('devolve o convite com o nome da liga e a situação dela', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', 2, 9));
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    const invites = await service.listPendingInvites(CONVIDADO);

    expect(invites).toHaveLength(1);
    expect(invites[0]?.leagueName).toBe('Liga dos Amigos');
    // A situação vem pronta: a tela não compara datas para descobri-la.
    expect(invites[0]?.status).toBe('scheduled');
  });

  it('não devolve convite de outra pessoa', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', 2, 9));
    repository.seedInvite('convite-1', LIGA, 'id-de-outra-pessoa');
    const service = await buildService(repository);

    await expect(service.listPendingInvites(CONVIDADO)).resolves.toEqual([]);
  });

  it('omite convite de liga já encerrada', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('liga-encerrada', 'Já acabou', -5, -4));
    repository.seed(ligaNoBanco(LIGA, 'Ainda vale', -1, 5));
    repository.seedInvite('convite-velho', 'liga-encerrada', CONVIDADO);
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    const invites = await service.listPendingInvites(CONVIDADO);

    // O convite não pode mais ser aceito, então mostrá-lo só ofereceria um
    // botão que falha.
    expect(invites.map((invite) => invite.leagueName)).toEqual(['Ainda vale']);
  });
});

describe('LeaguesService.acceptInvite', () => {
  const LIGA = 'id-da-liga';
  const CONVIDADO = 'id-do-convidado';

  it('entra na liga e consome o convite', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedParticipants(LIGA, [CRIADOR]);
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    const league = await service.acceptInvite('convite-1', CONVIDADO);

    // As duas coisas são a mesma operação: ou a pessoa está na liga e o convite
    // sumiu, ou nada aconteceu.
    expect(league.name).toBe('Liga dos Amigos');
    expect(league.status).toBe('running');
    expect(repository.invites).toHaveLength(0);
    await expect(
      repository.findParticipantUserIds(LIGA),
    ).resolves.toContain(CONVIDADO);
  });

  it('aceita convite de liga que já começou', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Valendo agora', -2, 5));
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    // Decisão de produto: entrar no meio é desvantagem de quem entra, e
    // bloquear seria decidir pela pessoa.
    await expect(
      service.acceptInvite('convite-1', CONVIDADO),
    ).resolves.toMatchObject({ status: 'running' });
  });

  it('recusa convite de liga encerrada, sem colocar a pessoa dentro', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Já acabou', -5, -4));
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    await expect(
      service.acceptInvite('convite-1', CONVIDADO),
    ).rejects.toThrow(LeagueAlreadyFinishedError);

    // O convite continua lá: nada foi consumido.
    expect(repository.invites).toHaveLength(1);
    await expect(
      repository.findParticipantUserIds(LIGA),
    ).resolves.not.toContain(CONVIDADO);
  });

  it('recusa convite de outra pessoa', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedInvite('convite-1', LIGA, 'id-de-outra-pessoa');
    const service = await buildService(repository);

    // Aceitar convite alheio entraria na liga em nome de outro. O id do
    // convidado faz parte da condição, não é só filtro de leitura.
    await expect(
      service.acceptInvite('convite-1', CONVIDADO),
    ).rejects.toThrow(LeagueInviteNotFoundError);
    expect(repository.invites).toHaveLength(1);
  });

  it('recusa convite que não existe', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await expect(
      service.acceptInvite('convite-que-nao-existe', CONVIDADO),
    ).rejects.toThrow(LeagueInviteNotFoundError);
  });
});

describe('LeaguesService.rejectInvite', () => {
  const LIGA = 'id-da-liga';
  const CONVIDADO = 'id-do-convidado';

  it('apaga o convite e não guarda nada', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    await service.rejectInvite('convite-1', CONVIDADO);

    // Sem histórico, por decisão registrada: a pessoa pode ser convidada de
    // novo depois sem nenhuma regra extra para decidir.
    expect(repository.invites).toHaveLength(0);
  });

  it('recusa apagar convite de outra pessoa', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedInvite('convite-1', LIGA, 'id-de-outra-pessoa');
    const service = await buildService(repository);

    await expect(
      service.rejectInvite('convite-1', CONVIDADO),
    ).rejects.toThrow(LeagueInviteNotFoundError);
    expect(repository.invites).toHaveLength(1);
  });

  it('permite recusar convite de liga encerrada', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Já acabou', -5, -4));
    repository.seedInvite('convite-1', LIGA, CONVIDADO);
    const service = await buildService(repository);

    // Recusar é sempre possível, inclusive para limpar convite que não
    // interessa mais — diferente de aceitar.
    await service.rejectInvite('convite-1', CONVIDADO);

    expect(repository.invites).toHaveLength(0);
  });
});
