import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MalformedLeagueIdError } from '../leagues/leagues.errors.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { OrderSide } from './order-side.js';
import { OrdersService } from './orders.service.js';
import type { ExecutedOrder } from './orders.service.js';

/**
 * O que a API devolve sobre uma ordem executada.
 *
 * Preço e custo saem na resposta de propósito: são os valores **aplicados**,
 * que podem diferir do que a tela estimou — o preço é buscado no instante da
 * execução. Sem eles, a tela mostraria a própria estimativa como se fosse o
 * que aconteceu.
 *
 * Saldo e posição também saem, para a tela se atualizar sem uma segunda
 * requisição logo depois da compra.
 */
type OrderResponse = {
  id: string;
  /** `buy` ou `sell`: é o que diz se o dinheiro saiu do saldo ou entrou nele. */
  side: OrderSide;
  symbol: string;
  /** Textos decimais, como todo valor monetário da API. Quem formata é o front. */
  quantity: string;
  unitPrice: string;
  totalCost: string;
  /** ISO 8601 em UTC, como nas datas de liga. */
  executedAt: string;
  cashBalance: string;
  positionQuantity: string;
};

/**
 * Mesmo pipe de id de liga do módulo de ligas, com o mesmo erro de domínio —
 * assim a mensagem de id malformado é idêntica nas duas rotas, em vez de uma
 * responder em português e a outra no texto padrão do Nest.
 */
const PARSE_LEAGUE_ID = new ParseUUIDPipe({
  version: '7',
  exceptionFactory: (message: string) => new MalformedLeagueIdError(message),
});

/**
 * Ordens de compra e venda.
 *
 * Rota aninhada na liga (`/leagues/:leagueId/orders`) porque uma ordem só
 * existe dentro de uma liga: é a liga que dá o saldo, a carteira e o ponto de
 * autorização. Uma rota `/orders` solta precisaria receber a liga no corpo, e
 * aí "de qual liga é esta ordem?" viraria dado do cliente.
 *
 * O guard está no controller, não no método: rota nova aqui nasce protegida.
 */
@UseGuards(JwtAuthGuard)
@Controller('leagues/:leagueId/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Registra uma ordem de compra ou de venda. 201 (default do Nest para
   * POST): a ordem é um recurso novo, e o registro dela é permanente.
   *
   * **Uma rota para os dois lados**, com `side` no corpo, em vez de
   * `/orders/buy` e `/orders/sell`: o recurso criado é o mesmo — uma linha em
   * `orders` — e o lado é atributo dele, inclusive no banco. Duas rotas
   * duplicariam autorização, validação e resposta para mudar um campo.
   *
   * Saldo ou carteira insuficientes viram 409, liga fora da janela vira 400,
   * não participar vira 403 e cotação indisponível vira 503 — o controller não
   * conhece nenhum desses status.
   */
  @Post()
  async place(
    @Param('leagueId', PARSE_LEAGUE_ID) leagueId: string,
    @Body() body: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponse> {
    const order = await this.orders.place({
      leagueId,
      // A identidade vem do token, nunca do corpo da requisição.
      userId: user.id,
      side: body.side,
      symbol: body.symbol,
      quantity: body.quantity,
    });

    return toOrderResponse(order);
  }
}

/** Campo a campo, como nas outras rotas: nada sai da API sem alguém decidir. */
function toOrderResponse(order: ExecutedOrder): OrderResponse {
  return {
    id: order.id,
    side: order.side,
    symbol: order.symbol,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalCost: order.totalCost,
    executedAt: order.executedAt.toISOString(),
    cashBalance: order.cashBalance,
    positionQuantity: order.positionQuantity,
  };
}
