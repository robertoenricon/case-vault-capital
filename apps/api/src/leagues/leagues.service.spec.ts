import { Test } from '@nestjs/testing';
import type { PublicUser } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';
import { LEAGUE_INITIAL_BALANCE } from './initial-balance.js';
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
  StoredParticipant,
  StoredParticipantLeague,
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
 * Saldo padrão do ambiente, do ponto de vista do service: ele o recebe pronto,
 * já conferido (ver initial-balance.spec.ts). Texto decimal, nunca número.
 */
const SALDO_CONFIGURADO = '10000';

/**
 * Linha de liga no banco, como o fake a guarda: a liga mais a base dela.
 *
 * `initialBalance` não sai em `StoredLeague` (nenhuma consulta o devolve hoje),
 * mas está na tabela — e é dele que o saldo de quem entra é copiado.
 */
type LinhaDeLiga = StoredLeague & { initialBalance: string };

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
  const rows: LinhaDeLiga[] = [];

  /**
   * Quem participa de cada liga, **na ordem de entrada** — a ordem do array é
   * o que reproduz o `orderBy` por `joined_at` do repositório real.
   */
  const participantsByLeague = new Map<string, string[]>();

  /** Nome de cada conta, como o join com `users` devolve no real. */
  const namesByUser = new Map<string, string>();

  /**
   * Saldo de cada participação — a coluna `cash_balance`, que é por liga e por
   * pessoa. A chave composta é o que reproduz a carteira separada: a mesma
   * conta em duas ligas tem duas entradas aqui.
   */
  const cashByParticipation = new Map<string, string>();

  function chaveDaParticipacao(leagueId: string, userId: string): string {
    return `${leagueId}:${userId}`;
  }

  /**
   * Saldo da participação. Participação sem saldo não existe no real (a coluna
   * é `NOT NULL`), então o valor ausente sai marcado em vez de vazio: teste que
   * esqueceu de semear a liga precisa falhar de forma legível, não comparar
   * `undefined` com número.
   */
  function saldoDaParticipacao(leagueId: string, userId: string): string {
    return (
      cashByParticipation.get(chaveDaParticipacao(leagueId, userId)) ??
      `sem-saldo-semeado:${userId}`
    );
  }

  /** Bitcoin em carteira por participação. Vazio = nunca comprou. */
  const btcByParticipation = new Map<string, string>();

  /**
   * Posição da participação.
   *
   * Zero quando não semeada, diferente do saldo acima: no real, participação
   * sem linha em `positions` é o estado normal de quem ainda não comprou, e o
   * repositório traduz a ausência em `"0"`. Marcar como erro aqui faria o
   * dublê mentir sobre o banco.
   */
  function bitcoinDaParticipacao(leagueId: string, userId: string): string {
    return btcByParticipation.get(chaveDaParticipacao(leagueId, userId)) ?? '0';
  }

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

    seed(league: LinhaDeLiga): void {
      rows.push(league);
    },

    /**
     * Grava a liga e a participação de quem criou, como o write aninhado do
     * real: as duas linhas nascem juntas, e as duas nascem com o mesmo saldo.
     */
    create(league: NewLeague): Promise<StoredParticipantLeague> {
      saved.push(league);

      const row: LinhaDeLiga = {
        id: ID_FIXO,
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
        initialBalance: league.initialBalance,
      };
      rows.push(row);

      participantsByLeague.set(row.id, [league.creatorId]);
      cashByParticipation.set(
        chaveDaParticipacao(row.id, league.creatorId),
        league.initialBalance,
      );

      return Promise.resolve({ ...row, cashBalance: league.initialBalance });
    },

    /**
     * Ligas da pessoa, cada uma com **o saldo dela ali** — o join filtrado do
     * real. Devolver um saldo só, igual para todos, esconderia a carteira por
     * liga, que é justamente o que a modelagem decidiu.
     */
    findByParticipant(userId: string): Promise<StoredParticipantLeague[]> {
      askedFor.push(userId);

      return Promise.resolve(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          cashBalance: saldoDaParticipacao(row.id, userId),
        })),
      );
    },

    /**
     * Quem participa de cada liga. Liga nunca semeada responde vazio, como o
     * banco.
     *
     * Cada participante semeado recebe o saldo da liga, como o real faz na
     * entrada — a menos que o teste diga outro valor (`seedCash`), para simular
     * quem já operou.
     */
    seedParticipants(leagueId: string, userIds: string[]): void {
      participantsByLeague.set(leagueId, userIds);

      const league = rows.find((row) => row.id === leagueId);
      if (!league) return;

      for (const userId of userIds) {
        cashByParticipation.set(
          chaveDaParticipacao(leagueId, userId),
          league.initialBalance,
        );
      }
    },

    /**
     * Bitcoin em carteira de uma participação, para simular quem já comprou.
     *
     * Quem não for semeado continua com `"0"` — e isso **é** o comportamento
     * do real: antes da primeira compra não existe linha em `positions`, e o
     * repositório traduz a ausência em zero.
     */
    seedBitcoin(leagueId: string, userId: string, quantity: string): void {
      btcByParticipation.set(chaveDaParticipacao(leagueId, userId), quantity);
    },

    /** Saldo de uma participação específica, para simular quem já gastou. */
    seedCash(leagueId: string, userId: string, cashBalance: string): void {
      cashByParticipation.set(
        chaveDaParticipacao(leagueId, userId),
        cashBalance,
      );
    },

    findParticipantUserIds(leagueId: string): Promise<string[]> {
      return Promise.resolve(participantsByLeague.get(leagueId) ?? []);
    },

    /** Nome de uma conta, para o join de participantes devolver algo. */
    seedUserName(userId: string, name: string): void {
      namesByUser.set(userId, name);
    },

    /**
     * Participantes com nome, na ordem de entrada. Liga nunca semeada responde
     * vazio, como o banco — é o que faz o service tratar liga inexistente como
     * liga de que a pessoa não participa.
     *
     * O nome ausente sai marcado em vez de `undefined`: o real nunca devolve
     * participante sem nome (a chave estrangeira garante a conta), então teste
     * que esqueceu de semear o nome precisa falhar de forma legível.
     */
    findParticipants(leagueId: string): Promise<StoredParticipant[]> {
      const userIds = participantsByLeague.get(leagueId) ?? [];

      return Promise.resolve(
        userIds.map((userId) => ({
          userId,
          name: namesByUser.get(userId) ?? `sem-nome-semeado:${userId}`,
          cashBalance: saldoDaParticipacao(leagueId, userId),
          bitcoinQuantity: bitcoinDaParticipacao(leagueId, userId),
        })),
      );
    },

    /** Campo a campo, como o `select` do real: a base da liga não sai daqui. */
    findById(leagueId: string): Promise<StoredLeague | null> {
      const league = rows.find((row) => row.id === leagueId);
      if (!league) return Promise.resolve(null);

      return Promise.resolve({
        id: league.id,
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
      });
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
     * é desta pessoa **e** a liga não encerrou. Devolver sempre o saldo aqui
     * esconderia a corrida que o service traduz em erro.
     *
     * O saldo de quem entra sai da **liga**, nunca da configuração do ambiente
     * — é o contrato do real, e um fake que copiasse do ambiente faria o teste
     * passar justamente no caso que a modelagem resolve.
     */
    consumeInvite(
      invite: { id: string; leagueId: string },
      userId: string,
      notFinishedAt: Date,
    ): Promise<string | null> {
      const index = invites.findIndex(
        (row) => row.id === invite.id && row.invitedUserId === userId,
      );
      if (index === -1) return Promise.resolve(null);

      const league = rows.find((row) => row.id === invite.leagueId);
      if (!league || league.endsAt.getTime() < notFinishedAt.getTime()) {
        return Promise.resolve(null);
      }

      invites.splice(index, 1);
      participantsByLeague.set(invite.leagueId, [
        ...(participantsByLeague.get(invite.leagueId) ?? []),
        userId,
      ]);
      cashByParticipation.set(
        chaveDaParticipacao(invite.leagueId, userId),
        league.initialBalance,
      );

      return Promise.resolve(league.initialBalance);
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

/**
 * @param initialBalance saldo padrão "do ambiente". É parâmetro para um teste
 * específico: o de que quem aceita convite recebe o saldo **da liga**, e não
 * este — a diferença só aparece quando os dois valores discordam.
 */
async function buildService(
  repository: ReturnType<typeof repositoryFake>,
  users: ReturnType<typeof usersServiceFake> = usersServiceFake([]),
  initialBalance: string = SALDO_CONFIGURADO,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LeaguesService,
      { provide: LeaguesRepository, useValue: repository },
      { provide: UsersService, useValue: users },
      { provide: LEAGUE_INITIAL_BALANCE, useValue: initialBalance },
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

/**
 * Linha de liga pronta, com período em dias relativos a agora.
 *
 * @param initialBalance a base da liga. O padrão é o mesmo valor configurado,
 * que é o caso normal; os testes passam outro valor quando precisam provar que
 * a base da liga e a configuração do ambiente são dados diferentes.
 */
function ligaNoBanco(
  id: string,
  name: string,
  startDays: number,
  endDays: number,
  initialBalance: string = SALDO_CONFIGURADO,
): LinhaDeLiga {
  return {
    id,
    name,
    startsAt: new Date(Date.now() + startDays * DIA_EM_MS),
    endsAt: new Date(Date.now() + endDays * DIA_EM_MS),
    initialBalance,
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

  it('grava a liga com uma cópia do saldo configurado', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    await service.create({
      name: 'Liga dos Amigos',
      startDate: diaEmUtc(1),
      endDate: diaEmUtc(8),
      timeZoneOffsetMinutes: UTC,
      creatorId: CRIADOR,
    });

    // A liga guarda o valor que valia no dia em que nasceu. É o que mantém o
    // ranking comparável se a configuração mudar depois — e é por isso que o
    // valor é copiado, não consultado no ambiente a cada leitura.
    expect(repository.saved[0]?.initialBalance).toBe(SALDO_CONFIGURADO);
  });

  it('devolve quem criou já com o saldo inicial', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    const created = await service.create({
      name: 'Liga dos Amigos',
      startDate: diaEmUtc(1),
      endDate: diaEmUtc(8),
      timeZoneOffsetMinutes: UTC,
      creatorId: CRIADOR,
    });

    // Texto decimal, não número: é assim que o valor atravessa até a tela sem
    // passar por ponto flutuante.
    expect(created.cashBalance).toBe(SALDO_CONFIGURADO);
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

  it('devolve o saldo que a pessoa tem em cada liga', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('liga-a', 'Liga A', -1, 5));
    repository.seed(ligaNoBanco('liga-b', 'Liga B', -1, 5));
    repository.seedParticipants('liga-a', [CRIADOR]);
    repository.seedParticipants('liga-b', [CRIADOR]);
    // A mesma pessoa já operou na Liga A e não tocou na Liga B.
    repository.seedCash('liga-a', CRIADOR, '7500.25');

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    // Carteira por liga, que é a decisão sob teste: um saldo só, repetido nas
    // duas, significaria carteira única e as ligas interferindo uma na outra.
    const saldos = new Map(leagues.map((l) => [l.name, l.cashBalance]));
    expect(saldos.get('Liga A')).toBe('7500.25');
    expect(saldos.get('Liga B')).toBe(SALDO_CONFIGURADO);
  });

  it('devolve o saldo de quem pediu, não o de outro participante', async () => {
    const BRUNO = 'id-do-bruno';
    const repository = repositoryFake();
    repository.seed(ligaNoBanco('liga-a', 'Liga A', -1, 5));
    repository.seedParticipants('liga-a', [CRIADOR, BRUNO]);
    repository.seedCash('liga-a', BRUNO, '1');

    const service = await buildService(repository);
    const leagues = await service.listForParticipant(CRIADOR);

    // O saldo da lista de ligas é sempre o de quem está chamando: é dado da
    // participação dela, não da liga.
    expect(leagues[0]?.cashBalance).toBe(SALDO_CONFIGURADO);
  });
});

describe('LeaguesService.listParticipants', () => {
  const LIGA = 'id-da-liga';
  const BRUNO = 'id-do-bruno';
  const DE_FORA = 'id-de-quem-nao-participa';

  /** Liga com dois participantes, nesta ordem de entrada. */
  function ligaComDois() {
    const repository = repositoryFake();
    repository.seedParticipants(LIGA, [CRIADOR, BRUNO]);
    repository.seedUserName(CRIADOR, 'Ana Prado');
    repository.seedUserName(BRUNO, 'Bruno Lima');

    return repository;
  }

  it('devolve os participantes na ordem de entrada', async () => {
    const repository = ligaComDois();
    const service = await buildService(repository);

    const participants = await service.listParticipants(LIGA, CRIADOR);

    // Quem criou entrou junto com a liga, então vem primeiro. A ordem é do
    // banco (`joined_at`); o que se testa aqui é que o service não a refaz.
    expect(participants.map((p) => p.name)).toEqual(['Ana Prado', 'Bruno Lima']);
  });

  it('inclui quem está pedindo a lista', async () => {
    const repository = ligaComDois();
    const service = await buildService(repository);

    const participants = await service.listParticipants(LIGA, CRIADOR);

    // Diferente da lista de convite, onde quem pede sai: aqui a pessoa é um
    // dos participantes, e uma lista de participantes sem ela estaria errada.
    expect(participants.map((p) => p.id)).toContain(CRIADOR);
  });

  it('recusa quem não participa da liga', async () => {
    const repository = ligaComDois();
    const service = await buildService(repository);

    await expect(
      service.listParticipants(LIGA, DE_FORA),
    ).rejects.toThrow(NotALeagueParticipantError);
  });

  it('trata liga inexistente como liga de que a pessoa não participa', async () => {
    const repository = repositoryFake();
    const service = await buildService(repository);

    // Mesmo erro dos dois casos, como nas outras rotas: assim não se descobre
    // a existência de ligas alheias testando ids.
    await expect(
      service.listParticipants('id-de-liga-que-nao-existe', CRIADOR),
    ).rejects.toThrow(NotALeagueParticipantError);
  });

  it('devolve o saldo de cada participante', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedParticipants(LIGA, [CRIADOR, BRUNO]);
    repository.seedUserName(CRIADOR, 'Ana Prado');
    repository.seedUserName(BRUNO, 'Bruno Lima');
    repository.seedCash(LIGA, BRUNO, '8200.10');

    const service = await buildService(repository);
    const participants = await service.listParticipants(LIGA, CRIADOR);

    // Decisão de produto: numa competição, todos acompanham o saldo de todos.
    // A autorização continua sendo a mesma — só quem participa lê esta lista.
    const saldos = new Map(participants.map((p) => [p.name, p.cashBalance]));
    expect(saldos.get('Ana Prado')).toBe(SALDO_CONFIGURADO);
    expect(saldos.get('Bruno Lima')).toBe('8200.10');
  });

  it('devolve o bitcoin em carteira de cada participante', async () => {
    const repository = repositoryFake();
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5));
    repository.seedParticipants(LIGA, [CRIADOR, BRUNO]);
    repository.seedUserName(CRIADOR, 'Ana Prado');
    repository.seedUserName(BRUNO, 'Bruno Lima');
    repository.seedBitcoin(LIGA, BRUNO, '0.06');

    const service = await buildService(repository);
    const participants = await service.listParticipants(LIGA, CRIADOR);

    // Mesma decisão de produto do saldo: numa competição, o que cada um tem é
    // informação de todos — e saldo sozinho enganaria, porque quem trocou
    // caixa por cripto aparece com pouco dinheiro.
    const posicoes = new Map(
      participants.map((p) => [p.name, p.bitcoinQuantity]),
    );
    expect(posicoes.get('Bruno Lima')).toBe('0.06');
  });

  it('mostra zero para quem nunca comprou, em vez de vazio', async () => {
    const repository = ligaComDois();
    const service = await buildService(repository);

    const participants = await service.listParticipants(LIGA, CRIADOR);

    // Antes da primeira compra não existe linha em `positions`. "Não tem
    // posição" e "tem zero" são a mesma coisa para quem lê a lista, e a
    // tradução acontece na camada de dados — a tela não decide isso.
    expect(participants.every((p) => p.bitcoinQuantity === '0')).toBe(true);
  });

  it('não consulta a base de usuários', async () => {
    const repository = ligaComDois();
    const users = usersServiceFake([]);
    const service = await buildService(repository, users);

    await service.listParticipants(LIGA, CRIADOR);

    // O nome do participante vem do join da própria participação, não da lista
    // de contas da plataforma: esta rota não tem motivo para tocar nela.
    expect(users.listedTimes).toBe(0);
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

  it('entra com o saldo da liga, não com o configurado agora no ambiente', async () => {
    const repository = repositoryFake();
    // A liga nasceu quando o padrão era 10.000 e guardou esse valor.
    repository.seed(ligaNoBanco(LIGA, 'Liga dos Amigos', -1, 5, '10000'));
    repository.seedParticipants(LIGA, [CRIADOR]);
    repository.seedInvite('convite-1', LIGA, CONVIDADO);

    // E o ambiente hoje diz outra coisa.
    const service = await buildService(repository, undefined, '50000');

    const league = await service.acceptInvite('convite-1', CONVIDADO);

    // É a decisão de modelagem inteira em um teste: todos os participantes de
    // uma liga começam com o mesmo valor, inclusive quem entra depois. Se o
    // saldo viesse do ambiente, quem aceitou hoje começaria com cinco vezes
    // mais dinheiro que quem criou a liga ontem — e o ranking viraria piada.
    expect(league.cashBalance).toBe('10000');
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
