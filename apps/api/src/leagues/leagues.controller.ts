import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateLeagueDto } from './dto/create-league.dto.js';
import type { LeagueStatus } from './league-status.js';
import { LeaguesService } from './leagues.service.js';
import type { LeagueWithStatus } from './leagues.service.js';

/** O que a API devolve sobre uma liga. Participantes não entram: a tela ainda não os pede. */
type LeagueResponse = {
  id: string;
  name: string;
  /** ISO 8601 em UTC. Quem formata para o fuso de quem lê é o front. */
  startsAt: string;
  endsAt: string;
  /**
   * Situação calculada pelo servidor. Sai em código (`running`), não em texto
   * de tela ("Em andamento"): a palavra é decisão de interface, e traduzir no
   * front evita que mudar o rótulo exija mexer na API.
   */
  status: LeagueStatus;
};

/**
 * Ligas.
 *
 * O guard está no controller, não em cada método: toda rota de liga exige
 * sessão, e assim rota nova nasce protegida — esquecer o `@UseGuards` passa a
 * ser impossível por aqui, em vez de depender de lembrar.
 */
@UseGuards(JwtAuthGuard)
@Controller('leagues')
export class LeaguesController {
  constructor(private readonly leagues: LeaguesService) {}

  /**
   * Ligas de quem está chamando. Nunca recebe id de usuário: o dono da lista é
   * sempre o do token, então não existe como pedir a lista de outra pessoa.
   *
   * Lista vazia é resposta normal (200 com `[]`), não 404: "você não participa
   * de liga nenhuma" é um estado legítimo da conta, não um recurso ausente.
   */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<LeagueResponse[]> {
    const leagues = await this.leagues.listForParticipant(user.id);

    return leagues.map(toLeagueResponse);
  }

  /**
   * Cria uma liga. O 201 é o default do Nest para POST.
   *
   * Período inválido vira 400 e payload fora do contrato também — o controller
   * não conhece nenhum dos dois status.
   */
  @Post()
  async create(
    @Body() body: CreateLeagueDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeagueResponse> {
    const league = await this.leagues.create({
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      timeZoneOffsetMinutes: body.timeZoneOffsetMinutes,
      // A identidade vem do token, nunca do corpo da requisição.
      creatorId: user.id,
    });

    return toLeagueResponse(league);
  }
}

/**
 * Monta a resposta campo a campo, como nas outras rotas: coluna nova no banco
 * não passa a aparecer na API sem alguém decidir. As datas saem em ISO
 * explícito em vez de depender de como o serializador trata `Date`.
 *
 * É a mesma forma na criação e na listagem de propósito — o front tem um tipo
 * só de liga, e a tela que acabou de criar não precisa de um caso especial.
 */
function toLeagueResponse(league: LeagueWithStatus): LeagueResponse {
  return {
    id: league.id,
    name: league.name,
    startsAt: league.startsAt.toISOString(),
    endsAt: league.endsAt.toISOString(),
    status: league.status,
  };
}
