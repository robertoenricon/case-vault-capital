import { Test } from '@nestjs/testing';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { Quote, QuotesProvider } from '../quotes/quotes-provider.js';
import { QuotesUnavailableError } from '../quotes/quotes.errors.js';
import { RankingRepository } from './ranking.repository.js';
import type { LeagueStandingsInput } from './ranking.repository.js';
import { RankingService } from './ranking.service.js';

/**
 * O que o service do ranking **decide**, sem banco, sem rede e sem subir
 * servidor: a quem recusar e quando a cotação é mesmo necessária.
 *
 * A ordenação e a aritmética são testadas à parte, na regra pura
 * (league-standings.spec.ts). Aqui o alvo é outro: a autorização por liga —
 * que nesta rota **não** sai da consulta, porque o ranking é de todos — e a
 * decisão de só consultar a Binance quando existe posição aberta.
 */

const LIGA = '0199c0de-0000-7000-8000-000000000001';
const PESSOA = '0199c0de-0000-7000-8000-000000000002';
const OUTRA_PESSOA = '0199c0de-0000-7000-8000-000000000003';
const PRECO = '80000';

/** Liga com uma pessoa em caixa, que é o estado de toda liga recém-criada. */
function ligaCom(
  participantes: { userId: string; bitcoinQuantity?: string; cashBalance?: string }[],
): LeagueStandingsInput {
  return {
    initialBalance: '10000',
    participants: participantes.map((p) => ({
      userId: p.userId,
      name: `Pessoa ${p.userId.slice(-1)}`,
      cashBalance: p.cashBalance ?? '10000',
      bitcoinQuantity: p.bitcoinQuantity ?? '0',
    })),
  };
}

/** Repositório dublê: `null` simula liga inexistente. */
class RepositorioFake {
  ligaAtual: LeagueStandingsInput | null = ligaCom([{ userId: PESSOA }]);

  findLeagueStandings(_leagueId: string): Promise<LeagueStandingsInput | null> {
    return Promise.resolve(this.ligaAtual);
  }
}

/**
 * Cotação dublê que **conta quantas vezes foi chamada**.
 *
 * A contagem é o ponto: a decisão sob teste é não ir à Binance quando ninguém
 * tem bitcoin, e isso não aparece no resultado — só na chamada que não
 * aconteceu.
 *
 * Honra o mesmo contrato da implementação real, inclusive no erro: quando
 * `indisponivel` está ligada, lança a mesma `QuotesUnavailableError` que a
 * Binance lançaria em rate limit. Um dublê que nunca falha faria o teste
 * passar e a produção quebrar.
 */
class CotacaoFake implements QuotesProvider {
  chamadas = 0;
  indisponivel = false;

  bitcoinPrice(): Promise<Quote> {
    this.chamadas += 1;

    if (this.indisponivel) {
      return Promise.reject(new QuotesUnavailableError('dublê de teste'));
    }

    return Promise.resolve({
      symbol: 'BTC',
      price: PRECO,
      asOf: new Date('2026-10-18T12:00:00.000Z'),
    });
  }
}

async function montar(): Promise<{
  service: RankingService;
  repositorio: RepositorioFake;
  cotacao: CotacaoFake;
}> {
  const repositorio = new RepositorioFake();
  const cotacao = new CotacaoFake();

  const modulo = await Test.createTestingModule({
    providers: [
      RankingService,
      { provide: RankingRepository, useValue: repositorio },
      { provide: QUOTES_PROVIDER, useValue: cotacao },
    ],
  }).compile();

  return { service: modulo.get(RankingService), repositorio, cotacao };
}

describe('RankingService', () => {
  describe('autorização', () => {
    it('recusa quem não participa da liga', async () => {
      const { service, repositorio } = await montar();
      repositorio.ligaAtual = ligaCom([{ userId: OUTRA_PESSOA }]);

      await expect(service.forLeague(LIGA, PESSOA)).rejects.toBeInstanceOf(
        NotALeagueParticipantError,
      );
    });

    it('responde igual para liga inexistente', async () => {
      // Mesmo erro do caso acima, de propósito: distinguir "não existe" de
      // "existe e você está fora" entregaria a existência de ligas alheias a
      // quem for tentando ids.
      const { service, repositorio } = await montar();
      repositorio.ligaAtual = null;

      await expect(service.forLeague(LIGA, PESSOA)).rejects.toBeInstanceOf(
        NotALeagueParticipantError,
      );
    });

    it('não consulta a cotação de quem nem participa', async () => {
      // A autorização vem antes da rede: tentativas de estranhos não gastam
      // chamada à Binance.
      const { service, repositorio, cotacao } = await montar();
      repositorio.ligaAtual = ligaCom([
        { userId: OUTRA_PESSOA, bitcoinQuantity: '1' },
      ]);

      await expect(service.forLeague(LIGA, PESSOA)).rejects.toBeInstanceOf(
        NotALeagueParticipantError,
      );
      expect(cotacao.chamadas).toBe(0);
    });

    it('devolve o ranking para quem participa', async () => {
      const { service, repositorio } = await montar();
      repositorio.ligaAtual = ligaCom([
        { userId: PESSOA },
        { userId: OUTRA_PESSOA },
      ]);

      const ranking = await service.forLeague(LIGA, PESSOA);

      // A liga inteira, não só a linha de quem perguntou: ranking com uma
      // pessoa não é ranking.
      expect(ranking.standings).toHaveLength(2);
    });
  });

  describe('cotação', () => {
    it('não consulta a Binance quando ninguém tem bitcoin', async () => {
      const { service, repositorio, cotacao } = await montar();
      repositorio.ligaAtual = ligaCom([
        { userId: PESSOA },
        { userId: OUTRA_PESSOA },
      ]);

      const ranking = await service.forLeague(LIGA, PESSOA);

      expect(cotacao.chamadas).toBe(0);
      // Sem preço usado, nenhum preço é anunciado: a tela não deve dizer que
      // avaliou as carteiras a um valor que ninguém leu.
      expect(ranking.bitcoinPrice).toBeUndefined();
      expect(ranking.pricedAt).toBeUndefined();
      expect(ranking.standings.map((s) => s.equity)).toEqual(['10000', '10000']);
    });

    it('serve o ranking mesmo com a Binance fora do ar, se ninguém tem bitcoin', async () => {
      // A decisão de produto inteira num teste: liga nova, todo mundo em
      // caixa, fonte de preço caída — e ainda assim há resposta, porque o
      // preço não entrava em nenhuma conta.
      const { service, repositorio, cotacao } = await montar();
      cotacao.indisponivel = true;
      repositorio.ligaAtual = ligaCom([{ userId: PESSOA }]);

      const ranking = await service.forLeague(LIGA, PESSOA);

      expect(ranking.standings[0].position).toBe(1);
    });

    it('consulta a Binance quando alguém tem bitcoin', async () => {
      const { service, repositorio, cotacao } = await montar();
      repositorio.ligaAtual = ligaCom([
        { userId: PESSOA, cashBalance: '2000', bitcoinQuantity: '0.1' },
        { userId: OUTRA_PESSOA },
      ]);

      const ranking = await service.forLeague(LIGA, PESSOA);

      expect(cotacao.chamadas).toBe(1);
      expect(ranking.bitcoinPrice).toBe(PRECO);
      // 2000 em caixa + 0.1 BTC a 80.000 = 10.000.
      expect(ranking.standings[0].equity).toBe('10000');
    });

    it('consulta uma vez só, não uma por participante', async () => {
      const { service, repositorio, cotacao } = await montar();
      repositorio.ligaAtual = ligaCom([
        { userId: PESSOA, bitcoinQuantity: '0.5' },
        { userId: OUTRA_PESSOA, bitcoinQuantity: '0.5' },
      ]);

      await service.forLeague(LIGA, PESSOA);

      // Preços diferentes entre linhas do mesmo ranking seriam uma disputa
      // apurada com duas réguas.
      expect(cotacao.chamadas).toBe(1);
    });

    it('recusa o ranking quando há posição aberta e a cotação falha', async () => {
      // Aqui o preço faz falta de verdade: sem ele, quem está todo em bitcoin
      // apareceria em último. Melhor 503 do que uma ordem errada com cara de
      // certa.
      const { service, repositorio, cotacao } = await montar();
      cotacao.indisponivel = true;
      repositorio.ligaAtual = ligaCom([
        { userId: PESSOA, cashBalance: '0', bitcoinQuantity: '0.1' },
      ]);

      await expect(service.forLeague(LIGA, PESSOA)).rejects.toBeInstanceOf(
        QuotesUnavailableError,
      );
    });
  });
});
