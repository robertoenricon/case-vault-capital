import { Test } from '@nestjs/testing';
import { LeagueStartsInPastError } from './leagues.errors.js';
import { LeaguesRepository } from './leagues.repository.js';
import type { NewLeague, StoredLeague } from './leagues.repository.js';
import { LeaguesService } from './leagues.service.js';

/**
 * Regras da criação de liga, sem banco e sem subir servidor: o repositório
 * entra como dublê. O que está sob teste é o que o service decide — quem criou
 * entra na liga, e período inválido não grava nada.
 *
 * Os testes usam fuso UTC e datas a partir de amanhã. Motivo: o service chama
 * `new Date()` (é onde "agora" entra no sistema), então fixar o dia aqui
 * deixaria o teste quebrando sozinho com o passar do tempo. A conta de dia e
 * instante em si é testada em league-period.spec.ts, onde o "agora" é parâmetro.
 */

const ID_FIXO = 'id-fixo-de-liga';
const CRIADOR = 'id-de-quem-criou';
const UTC = 0;
const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Guarda o que o service mandou gravar, para o teste conferir o que foi decidido. */
function repositoryFake() {
  const saved: NewLeague[] = [];

  return {
    saved,
    create(league: NewLeague): Promise<StoredLeague> {
      saved.push(league);

      return Promise.resolve({
        id: ID_FIXO,
        name: league.name,
        startsAt: league.startsAt,
        endsAt: league.endsAt,
      });
    },
  };
}

async function buildService(repository: ReturnType<typeof repositoryFake>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LeaguesService,
      { provide: LeaguesRepository, useValue: repository },
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
