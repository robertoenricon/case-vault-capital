import { Inject, Injectable } from '@nestjs/common';
import { NotALeagueParticipantError } from '../leagues/leagues.errors.js';
import { isPositiveAmount } from '../orders/order-cost.js';
import { QUOTES_PROVIDER } from '../quotes/quotes-provider.js';
import type { QuotesProvider } from '../quotes/quotes-provider.js';
import { rankParticipants } from './league-standings.js';
import type { Standing } from './league-standings.js';
import { RankingRepository } from './ranking.repository.js';

/**
 * Ranking de uma liga, pronto para a tela.
 *
 * O preço e o instante saem junto das colocações de propósito: este ranking é
 * uma **foto**, não um resultado fechado. Sem dizer com que preço avaliou,
 * a tela mostraria posições que mudam sozinhas sem explicar por quê.
 */
export type LeagueRanking = {
  /** Base de comparação: o saldo com que todos começaram, em texto decimal. */
  initialBalance: string;
  /**
   * Preço do bitcoin usado para avaliar as carteiras.
   *
   * **Ausente quando ninguém na liga tem bitcoin**: nesse caso a cotação nem
   * chega a ser consultada (ver `forLeague`), e anunciar um preço que não foi
   * usado seria inventar dado.
   */
  bitcoinPrice?: string;
  /** Quando esse preço foi lido da fonte. Ausente pelo mesmo motivo. */
  pricedAt?: Date;
  /** Colocações, da primeira para a última. */
  standings: Standing[];
};

@Injectable()
export class RankingService {
  constructor(
    private readonly ranking: RankingRepository,
    /**
     * Cotações pela **interface**, nunca pela Binance — mesmo ponto de
     * inversão de dependência do módulo de ordens. O teste injeta um dublê e
     * nenhuma linha daqui sabe de onde o preço veio.
     */
    @Inject(QUOTES_PROVIDER) private readonly quotes: QuotesProvider,
  ) {}

  /**
   * Monta o ranking da liga: quem está na frente, com quanto e quanto variou.
   *
   * **A cotação só é consultada se alguém tiver bitcoin.** Decisão registrada:
   * numa liga em que todo mundo ainda está em caixa, o preço não entra em
   * nenhuma conta (a carteira de todos vale zero), e derrubar o ranking porque
   * a Binance caiu seria recusar uma resposta que não dependia dela. Havendo
   * posição aberta é o contrário: sem preço não existe patrimônio, e a
   * `QuotesUnavailableError` sobe como 503 em vez de o ranking exibir uma
   * ordem errada com cara de certa.
   *
   * O ranking vale para liga agendada, em andamento e encerrada, sem
   * distinção. Liga encerrada **continua avaliada a preço atual** — o
   * resultado dela ainda se move com o mercado. É limitação conhecida e
   * registrada: congelar exigiria preço histórico, que a interface de cotações
   * não tem.
   */
  async forLeague(leagueId: string, requesterId: string): Promise<LeagueRanking> {
    const league = await this.ranking.findLeagueStandings(leagueId);

    // Liga inexistente e liga de que a pessoa não participa respondem igual, de
    // propósito: distinguir as duas entregaria a existência de ligas alheias a
    // quem for tentando ids (ver leagues.errors.ts).
    if (!league) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    // A autorização: quem pergunta precisa estar na lista que vai receber. A
    // consulta não filtra por participante — não teria como, o ranking é de
    // todos —, então é esta linha que impede a liga alheia de vazar inteira.
    if (!league.participants.some((p) => p.userId === requesterId)) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    const hasOpenPosition = league.participants.some((p) =>
      isPositiveAmount(p.bitcoinQuantity),
    );

    const quote = hasOpenPosition ? await this.quotes.bitcoinPrice() : undefined;

    return {
      initialBalance: league.initialBalance,
      bitcoinPrice: quote?.price,
      pricedAt: quote?.asOf,
      /*
       * `"0"` como preço quando não há cotação é seguro, e não um valor
       * chutado: só se chega aqui sem preço quando **toda** quantidade é zero,
       * e zero vezes qualquer preço é zero. A alternativa seria um caminho
       * separado na regra pura para "sem preço", que calcularia o mesmo.
       */
      standings: rankParticipants(
        league.participants,
        league.initialBalance,
        quote?.price ?? '0',
      ),
    };
  }
}
