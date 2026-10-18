import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateLeagueDto } from './dto/create-league.dto.js';
import type { LeagueStatus } from './league-status.js';
import { MalformedLeagueIdError } from './leagues.errors.js';
import { LeaguesService } from './leagues.service.js';
import type { LeagueCandidate, LeagueWithStatus } from './leagues.service.js';

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

/** Pessoa na lista de convite. Sem e-mail: ver users.repository.ts. */
type LeagueCandidateResponse = {
  id: string;
  name: string;
  alreadyParticipant: boolean;
};

/**
 * Todos os ids do projeto são UUID v7, então vale conferir a versão e não só o
 * formato — id de outra versão não existiria no banco de qualquer forma.
 *
 * A fábrica de exceção troca o texto padrão do Nest, que é em inglês, pelo erro
 * de domínio: a mensagem que chega ao cliente fica em português como as outras.
 */
const PARSE_LEAGUE_ID = new ParseUUIDPipe({
  version: '7',
  exceptionFactory: (message: string) => new MalformedLeagueIdError(message),
});

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

  /**
   * Pessoas que podem ser convidadas para a liga.
   *
   * Rota no escopo da liga, e não `/users`, porque a resposta depende da liga:
   * é ela que diz quem já está dentro. É também o que dá o ponto de
   * autorização — quem não participa recebe 403, pelo
   * `NotALeagueParticipantError`, e não uma lista da base de usuários.
   */
  @Get(':leagueId/candidates')
  async listCandidates(
    @Param('leagueId', PARSE_LEAGUE_ID) leagueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeagueCandidateResponse[]> {
    const candidates = await this.leagues.listCandidates(leagueId, user.id);

    return candidates.map(toCandidateResponse);
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
/**
 * Mesma regra da liga: campo a campo. Aqui isso também é defesa — é o último
 * ponto antes de a resposta sair, e nenhum campo de conta aparece sem estar
 * escrito aqui.
 */
function toCandidateResponse(
  candidate: LeagueCandidate,
): LeagueCandidateResponse {
  return {
    id: candidate.id,
    name: candidate.name,
    alreadyParticipant: candidate.alreadyParticipant,
  };
}

function toLeagueResponse(league: LeagueWithStatus): LeagueResponse {
  return {
    id: league.id,
    name: league.name,
    startsAt: league.startsAt.toISOString(),
    endsAt: league.endsAt.toISOString(),
    status: league.status,
  };
}
