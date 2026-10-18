import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateLeagueDto } from './dto/create-league.dto.js';
import { LeaguesService } from './leagues.service.js';

/** O que a API devolve sobre uma liga. Participantes não entram: a tela ainda não os pede. */
type LeagueResponse = {
  id: string;
  name: string;
  /** ISO 8601 em UTC. Quem formata para o fuso de quem lê é o front. */
  startsAt: string;
  endsAt: string;
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

    // Resposta montada campo a campo, como nas outras rotas. As datas saem em
    // ISO explícito em vez de depender de como o serializador trata `Date`.
    return {
      id: league.id,
      name: league.name,
      startsAt: league.startsAt.toISOString(),
      endsAt: league.endsAt.toISOString(),
    };
  }
}
