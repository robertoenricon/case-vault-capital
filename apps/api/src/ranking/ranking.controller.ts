import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MalformedLeagueIdError } from '../leagues/leagues.errors.js';
import type { Standing } from './league-standings.js';
import { RankingService } from './ranking.service.js';
import type { LeagueRanking } from './ranking.service.js';

/** Uma colocação, como a API a devolve. Textos decimais; quem formata é o front. */
type StandingResponse = {
  position: number;
  /** Id da conta — é por ele que a tela acha a própria linha. */
  userId: string;
  name: string;
  cashBalance: string;
  bitcoinQuantity: string;
  bitcoinValue: string;
  equity: string;
  /** Pontos percentuais sobre o saldo inicial: `"4.3"` é +4,3%. */
  returnPercent: string;
};

/**
 * O ranking inteiro.
 *
 * Preço e instante são opcionais e isso é parte da resposta, não descuido:
 * eles só existem quando alguém na liga tem bitcoin (ver ranking.service.ts).
 * A tela usa a ausência para não anunciar uma avaliação que não aconteceu.
 */
type RankingResponse = {
  initialBalance: string;
  bitcoinPrice?: string;
  /** ISO 8601 em UTC, como as outras datas da API. */
  pricedAt?: string;
  standings: StandingResponse[];
};

/**
 * Mesmo pipe de id de liga dos outros módulos, com o mesmo erro de domínio —
 * assim a mensagem de id malformado é idêntica em todas as rotas de liga.
 */
const PARSE_LEAGUE_ID = new ParseUUIDPipe({
  version: '7',
  exceptionFactory: (message: string) => new MalformedLeagueIdError(message),
});

/**
 * Ranking da liga.
 *
 * Rota aninhada (`/leagues/:leagueId/ranking`) pelo mesmo motivo das ordens:
 * ranking só existe dentro de uma liga, e é a liga que dá o ponto de
 * autorização. No singular porque o recurso é **um** — a classificação da
 * liga —, não uma coleção de rankings.
 *
 * O guard está no controller, não no método: rota nova aqui nasce protegida.
 */
@UseGuards(JwtAuthGuard)
@Controller('leagues/:leagueId/ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  /**
   * Classificação atual da liga. 200.
   *
   * Calculado a cada leitura, sem cache nem job: a liga é de amigos, a
   * consulta é uma ida ao banco mais, no máximo, uma à Binance, e um ranking
   * em cache mostraria colocação velha logo depois de alguém operar. É a mesma
   * decisão já registrada para a cotação.
   *
   * Não participar vira 403 e cotação indisponível vira 503 — o controller não
   * conhece nenhum dos dois status.
   */
  @Get()
  async forLeague(
    @Param('leagueId', PARSE_LEAGUE_ID) leagueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankingResponse> {
    // A identidade vem do token, nunca da rota: quem pede o ranking é quem
    // está autenticado, e é essa identidade que precisa estar na liga.
    const ranking = await this.ranking.forLeague(leagueId, user.id);

    return toRankingResponse(ranking);
  }
}

/** Campo a campo, como nas outras rotas: nada sai da API sem alguém decidir. */
function toRankingResponse(ranking: LeagueRanking): RankingResponse {
  return {
    initialBalance: ranking.initialBalance,
    bitcoinPrice: ranking.bitcoinPrice,
    pricedAt: ranking.pricedAt?.toISOString(),
    standings: ranking.standings.map(toStandingResponse),
  };
}

function toStandingResponse(standing: Standing): StandingResponse {
  return {
    position: standing.position,
    userId: standing.userId,
    name: standing.name,
    cashBalance: standing.cashBalance,
    bitcoinQuantity: standing.bitcoinQuantity,
    bitcoinValue: standing.bitcoinValue,
    equity: standing.equity,
    returnPercent: standing.returnPercent,
  };
}
