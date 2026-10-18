import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateLeagueDto } from './dto/create-league.dto.js';
import { InviteToLeagueDto } from './dto/invite-to-league.dto.js';
import type { LeagueStatus } from './league-status.js';
import {
  MalformedInviteIdError,
  MalformedLeagueIdError,
} from './leagues.errors.js';
import { LeaguesService } from './leagues.service.js';
import type {
  LeagueCandidate,
  LeagueWithStatus,
  PendingInvite,
} from './leagues.service.js';

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
  invitePending: boolean;
};

/** Convite pendente, como a tela de quem foi convidado precisa dele. */
type PendingInviteResponse = {
  id: string;
  leagueName: string;
  /** ISO 8601 em UTC, como na liga. Quem formata é o front. */
  startsAt: string;
  endsAt: string;
  status: LeagueStatus;
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

/** Mesmo pipe para o id de convite, com o erro (e a mensagem) do convite. */
const PARSE_INVITE_ID = new ParseUUIDPipe({
  version: '7',
  exceptionFactory: (message: string) => new MalformedInviteIdError(message),
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
   * Convites pendentes de quem está chamando. Como em `list`, nunca recebe id
   * de usuário: o dono dos convites é sempre o do token.
   *
   * Declarada **antes** das rotas com `:leagueId` de propósito: o Nest casa a
   * primeira que combina, então um `@Get(':leagueId')` futuro, declarado acima
   * desta, engoliria `/leagues/invites` tratando "invites" como id de liga.
   */
  @Get('invites')
  async listInvites(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingInviteResponse[]> {
    const invites = await this.leagues.listPendingInvites(user.id);

    return invites.map(toInviteResponse);
  }

  /**
   * Aceita o convite: entra na liga. Devolve a liga, para a tela confirmar
   * qual foi sem outra requisição.
   *
   * 200 e não 201: o recurso criado é a participação, que não tem URL própria
   * na API — o que o cliente recebe de volta é a liga, que já existia.
   */
  @Post('invites/:inviteId/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param('inviteId', PARSE_INVITE_ID) inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeagueResponse> {
    const league = await this.leagues.acceptInvite(inviteId, user.id);

    return toLeagueResponse(league);
  }

  /**
   * Recusa o convite. 204 porque não sobra nada para devolver: a recusa não é
   * guardada, o convite deixa de existir.
   */
  @Post('invites/:inviteId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectInvite(
    @Param('inviteId', PARSE_INVITE_ID) inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.leagues.rejectInvite(inviteId, user.id);
  }

  /**
   * Convida alguém para a liga.
   *
   * 204: o convite não tem URL própria para o cliente buscar depois, e quem o
   * recebeu é quem vai lê-lo (em `GET /leagues/invites`). Devolver o id dele a
   * quem convidou não serviria para nada.
   */
  @Post(':leagueId/invites')
  @HttpCode(HttpStatus.NO_CONTENT)
  async invite(
    @Param('leagueId', PARSE_LEAGUE_ID) leagueId: string,
    @Body() body: InviteToLeagueDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    // Quem convida vem do token; o corpo diz só quem está sendo convidado.
    await this.leagues.invite(leagueId, body.userId, user.id);
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
    invitePending: candidate.invitePending,
  };
}

/**
 * Mesma regra: campo a campo. O `leagueId` **não** sai — a pessoa ainda não
 * participa da liga, e o id dela só serviria para tentar rotas que o backend
 * vai recusar. O que a tela precisa é o nome, o período e a situação.
 */
function toInviteResponse(invite: PendingInvite): PendingInviteResponse {
  return {
    id: invite.id,
    leagueName: invite.leagueName,
    startsAt: invite.startsAt.toISOString(),
    endsAt: invite.endsAt.toISOString(),
    status: invite.status,
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
