import { Inject, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { LEAGUE_INITIAL_BALANCE } from './initial-balance.js';
import { buildLeaguePeriod } from './league-period.js';
import { leagueStatusAt } from './league-status.js';
import type { LeagueStatus } from './league-status.js';
import {
  LeagueAlreadyFinishedError,
  LeagueInviteNotFoundError,
  NotALeagueParticipantError,
  UserAlreadyInLeagueError,
} from './leagues.errors.js';
import { LeaguesRepository } from './leagues.repository.js';
import type {
  StoredInvite,
  StoredParticipantLeague,
} from './leagues.repository.js';

/** Entrada da regra, já validada na borda. O criador vem do token, não do corpo. */
export type CreateLeagueInput = {
  name: string;
  /** Dia de início, `AAAA-MM-DD`, como a pessoa escolheu no formulário. */
  startDate: string;
  /** Dia de fim, `AAAA-MM-DD`. */
  endDate: string;
  /** Fuso de quem está criando, em minutos (ver league-period.ts). */
  timeZoneOffsetMinutes: number;
  creatorId: string;
};

/**
 * Liga como o domínio a entrega para **um participante**: o que está gravado
 * (liga e saldo dele ali) mais a situação, que não é coluna — é calculada a
 * cada leitura a partir do período e do instante atual.
 */
export type LeagueWithStatus = StoredParticipantLeague & {
  status: LeagueStatus;
};

/**
 * Ordem em que as ligas aparecem na lista. A que está valendo vem primeiro,
 * porque é nela que a pessoa tem algo a fazer agora; a encerrada fica por
 * último, presente como histórico.
 */
const STATUS_ORDER: Record<LeagueStatus, number> = {
  running: 0,
  scheduled: 1,
  finished: 2,
};

/**
 * Pessoa que pode ser convidada para uma liga, do ponto de vista de quem está
 * olhando a lista: o nome para reconhecer e se já está dentro.
 *
 * Não tem e-mail — nem aqui nem na consulta que a origina (ver
 * users.repository.ts): e-mail de terceiro não sai da aplicação.
 */
export type LeagueCandidate = {
  id: string;
  name: string;
  /** `true` quando a pessoa já participa: a tela mostra isso no lugar do convite. */
  alreadyParticipant: boolean;
  /**
   * `true` quando já existe convite pendente para ela.
   *
   * Sem este campo o botão mentiria: a tela ofereceria "Convidar" e o clique
   * voltaria com 409 do índice único.
   */
  invitePending: boolean;
};

/**
 * Participante da liga, como a lista da tela o mostra: o nome e o saldo.
 *
 * O saldo de cada um é visível a todos os participantes, por decisão de
 * produto: a liga é uma competição, e o ranking vai mostrar o mesmo número
 * para todo mundo de qualquer forma. Nem e-mail (que não sai da aplicação) nem
 * data de entrada — quando o ranking existir, é aqui que posição e patrimônio
 * em cripto entram, e aí a data de entrada volta a fazer diferença (quem
 * entrou com a liga em andamento disputou menos tempo).
 */
export type LeagueParticipant = {
  /** Id da conta. Serve de chave estável na lista da tela. */
  id: string;
  name: string;
  /** Dinheiro que a pessoa tem nesta liga, em texto decimal. */
  cashBalance: string;
};

/**
 * Convite pendente como a tela de quem foi convidado o mostra: o nome da liga,
 * o período e a situação dela — é isso que a pessoa precisa para decidir se
 * entra.
 */
export type PendingInvite = StoredInvite & {
  status: LeagueStatus;
};

@Injectable()
export class LeaguesService {
  constructor(
    private readonly leagues: LeaguesRepository,
    // Ligas dependem de contas (precisam saber quem existe), nunca o contrário:
    // o módulo de contas não conhece liga nenhuma.
    private readonly users: UsersService,
    /**
     * Saldo padrão de uma liga nova, em texto decimal, já conferido no boot
     * (ver initial-balance.ts).
     *
     * Injetado, e não lido de `process.env` aqui: a regra passa a receber a
     * configuração em vez de ir buscá-la, e o teste roda sem ambiente montado.
     * Só a **criação** o usa — para quem aceita convite, a base vem da própria
     * liga.
     */
    @Inject(LEAGUE_INITIAL_BALANCE) private readonly initialBalance: string,
  ) {}

  /**
   * Cria a liga com quem criou já dentro dela, com o saldo inicial.
   *
   * Três decisões ficam aqui porque são regra, não transporte nem banco: o
   * período é calculado pelo servidor a partir do dia escolhido (o cliente não
   * dita instante); quem cria entra como participante — sem papel e sem
   * permissão, porque numa liga entre amigos não há o que autorizar; e a liga
   * nasce com uma cópia do saldo padrão configurado, que daí em diante é a base
   * dela. O cliente não manda o saldo, nem poderia: o payload de criação não
   * tem esse campo (ver dto/create-league.dto.ts).
   */
  async create(input: CreateLeagueInput): Promise<LeagueWithStatus> {
    // Um único "agora" para a regra do período e para a situação: com duas
    // chamadas a `new Date()` os dois poderiam cair em lados diferentes da
    // virada do dia. Este service é o lugar onde o tempo entra no sistema.
    const now = new Date();

    const period = buildLeaguePeriod(
      {
        startDate: input.startDate,
        endDate: input.endDate,
        timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
      },
      now,
    );

    const league = await this.leagues.create({
      name: input.name,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      creatorId: input.creatorId,
      // Cópia, não referência: a liga guarda o valor que valia hoje. Mudar a
      // configuração amanhã não mexe nesta liga — é o que mantém o ranking
      // comparável depois (ver schema.prisma).
      initialBalance: this.initialBalance,
    });

    return { ...league, status: leagueStatusAt(league, now) };
  }

  /**
   * Ligas de que a pessoa participa, com a situação de cada uma, na ordem em
   * que a tela as mostra.
   *
   * A situação é calculada na leitura, não guardada: uma coluna de situação
   * ficaria errada sozinha na virada da meia-noite, e precisaria de um job só
   * para envelhecer bem.
   *
   * A ordenação é feita aqui, em memória, e não no SQL, porque depende da
   * situação — que o banco não conhece. Vale enquanto um participante tem
   * poucas ligas, que é o caso de uma liga entre amigos. Com paginação isso
   * muda: aí a ordem precisa ir para a consulta, e a situação com ela.
   */
  async listForParticipant(userId: string): Promise<LeagueWithStatus[]> {
    const leagues = await this.leagues.findByParticipant(userId);

    // O mesmo instante para todas: com um `new Date()` por liga, duas ligas com
    // o mesmo fim poderiam sair uma "em andamento" e outra "encerrada".
    const now = new Date();

    return leagues
      .map((league) => ({ ...league, status: leagueStatusAt(league, now) }))
      .sort(compareForListing);
  }

  /**
   * Quem participa da liga, na ordem de entrada.
   *
   * Uma regra fica aqui: **só participante enxerga a lista**. E a autorização
   * sai da própria lista — quem pede precisa estar nela. Isso é de propósito,
   * em vez de consultar os ids antes e os nomes depois: duas consultas
   * poderiam discordar se alguém entrasse na liga entre uma e outra, e uma
   * delas seria trabalho repetido.
   *
   * Liga que não existe devolve lista vazia no repositório, então quem pede não
   * está nela e recebe o mesmo erro de quem está de fora — como nas outras
   * rotas, não há como descobrir liga alheia testando ids.
   *
   * Consequência conhecida: quem participa vê o nome dos outros participantes.
   * É inerente ao produto (a liga é entre amigos e o ranking vai mostrar os
   * mesmos nomes), e é bem menos do que a lista de convite já expõe — ali
   * aparecem todas as contas da plataforma.
   */
  async listParticipants(
    leagueId: string,
    requesterId: string,
  ): Promise<LeagueParticipant[]> {
    const participants = await this.leagues.findParticipants(leagueId);

    if (!participants.some((p) => p.userId === requesterId)) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    // A ordem vem da consulta e não é refeita aqui: ela depende de coluna
    // (`joined_at`), diferente da ordem da lista de ligas, que depende da
    // situação calculada.
    return participants.map((participant) => ({
      id: participant.userId,
      name: participant.name,
      cashBalance: participant.cashBalance,
    }));
  }

  /**
   * Quem pode ser convidado para a liga: todas as contas cadastradas, cada uma
   * marcada se já participa.
   *
   * Duas regras ficam aqui:
   *
   * 1. **Autorização.** Só participante da liga enxerga a lista. Quem não
   *    participa — e quem passa um id de liga que não existe — recebe o mesmo
   *    erro, então não há como descobrir ligas alheias testando ids.
   * 2. **Quem está pedindo sai da lista.** Ninguém se convida, e a pessoa já
   *    sabe que está dentro. Mantê-la ali só gastaria uma linha dizendo o óbvio.
   *
   * Quem já participa continua aparecendo, marcado: quem procura o amigo precisa
   * distinguir "ele já está na liga" de "ele não tem conta" — some a lista e as
   * duas situações viram a mesma tela vazia.
   */
  async listCandidates(
    leagueId: string,
    requesterId: string,
  ): Promise<LeagueCandidate[]> {
    const participantIds = await this.leagues.findParticipantUserIds(leagueId);

    // `Set` porque a marcação abaixo consulta esta coleção uma vez por conta
    // cadastrada: com `includes`, seriam participantes × contas comparações.
    const participants = new Set(participantIds);

    if (!participants.has(requesterId)) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    const users = await this.users.listPublic();
    const invited = new Set(await this.leagues.findInvitedUserIds(leagueId));

    return users
      .filter((user) => user.id !== requesterId)
      .map((user) => ({
        id: user.id,
        name: user.name,
        alreadyParticipant: participants.has(user.id),
        invitePending: invited.has(user.id),
      }));
  }

  /**
   * Convida alguém para a liga.
   *
   * Três regras ficam aqui:
   *
   * 1. **Autorização.** Só participante convida — a liga não tem dono nem
   *    papéis, então qualquer um de dentro pode chamar mais gente. Quem está
   *    fora recebe o mesmo erro de liga inexistente.
   * 2. **Quem já está dentro não é convidado.** Isso também cobre convidar a si
   *    mesmo: quem chama participa, então cai neste caso.
   * 3. **Liga encerrada não recebe convite**, porque o aceite seria recusado
   *    depois — não faz sentido criar um convite que já nasce impossível.
   *
   * O convite duplicado **não** é verificado aqui: quem o impede é o índice
   * único do banco (ver leagues.repository.ts). Uma verificação prévia deixaria
   * dois convites simultâneos passarem.
   */
  async invite(
    leagueId: string,
    invitedUserId: string,
    requesterId: string,
  ): Promise<void> {
    const participants = new Set(
      await this.leagues.findParticipantUserIds(leagueId),
    );

    if (!participants.has(requesterId)) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    if (participants.has(invitedUserId)) {
      throw new UserAlreadyInLeagueError(leagueId, invitedUserId);
    }

    const league = await this.leagues.findById(leagueId);

    // A liga existe: a autorização acima só passa se ela tiver participantes.
    // O `null` é tratado como "não participa" pelo mesmo motivo de sempre —
    // nunca contar a quem pergunta se a liga existe.
    if (!league) {
      throw new NotALeagueParticipantError(leagueId, requesterId);
    }

    if (leagueStatusAt(league, new Date()) === 'finished') {
      throw new LeagueAlreadyFinishedError(leagueId);
    }

    await this.leagues.createInvite(leagueId, invitedUserId);
  }

  /**
   * Convites pendentes da pessoa.
   *
   * Convite de liga **encerrada não entra na lista**: ele não pode mais ser
   * aceito, então mostrá-lo só ofereceria um botão que falha. É consequência
   * direta da regra de aceite — a linha continua no banco e sai junto com a
   * liga, porque limpá-la exigiria um job que o MVP não tem motivo para ter.
   */
  async listPendingInvites(userId: string): Promise<PendingInvite[]> {
    const invites = await this.leagues.findPendingInvitesForUser(userId);

    // Um único "agora" para todos, como na listagem de ligas: com um
    // `new Date()` por convite, dois convites da mesma liga poderiam discordar.
    const now = new Date();

    return invites
      .map((invite) => ({ ...invite, status: leagueStatusAt(invite, now) }))
      .filter((invite) => invite.status !== 'finished');
  }

  /**
   * Aceita o convite: a pessoa entra na liga e o convite deixa de existir.
   *
   * A liga encerrada é recusada aqui, com erro próprio, para a tela poder
   * explicar o motivo. A mesma condição vai **de novo** para a escrita, no
   * `where` do repositório: esta verificação é para a mensagem, aquela é a
   * garantia — entre ler e gravar, a liga pode encerrar.
   *
   * Devolve a liga com a situação **e o saldo com que a pessoa entrou**, para a
   * tela confirmar em que liga ela acabou de entrar sem precisar de outra
   * requisição. Esse saldo é a base da própria liga, não a configuração do
   * ambiente: quem entra depois começa igual a quem criou.
   */
  async acceptInvite(
    inviteId: string,
    userId: string,
  ): Promise<LeagueWithStatus> {
    const invite = await this.leagues.findInviteForUser(inviteId, userId);

    if (!invite) {
      throw new LeagueInviteNotFoundError(inviteId, userId);
    }

    const now = new Date();

    if (leagueStatusAt(invite, now) === 'finished') {
      throw new LeagueAlreadyFinishedError(invite.leagueId);
    }

    const cashBalance = await this.leagues.consumeInvite(invite, userId, now);

    // `null` = o convite não estava mais disponível no instante da escrita
    // (respondido em paralelo, ou a liga encerrou no meio). Mesma resposta do
    // convite inexistente: para quem está na tela, o convite não está mais lá.
    if (cashBalance === null) {
      throw new LeagueInviteNotFoundError(inviteId, userId);
    }

    return {
      id: invite.leagueId,
      name: invite.leagueName,
      startsAt: invite.startsAt,
      endsAt: invite.endsAt,
      cashBalance,
      status: leagueStatusAt(invite, now),
    };
  }

  /**
   * Recusa o convite: a linha é apagada e nada é guardado.
   *
   * Não confere situação da liga — recusar é sempre possível, inclusive para
   * limpar um convite que não interessa mais.
   */
  async rejectInvite(inviteId: string, userId: string): Promise<void> {
    const deleted = await this.leagues.deleteInviteForUser(inviteId, userId);

    if (!deleted) {
      throw new LeagueInviteNotFoundError(inviteId, userId);
    }
  }
}

/** Situação primeiro; dentro do mesmo grupo, a de início mais recente antes. */
function compareForListing(
  a: LeagueWithStatus,
  b: LeagueWithStatus,
): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (byStatus !== 0) return byStatus;

  const byStart = b.startsAt.getTime() - a.startsAt.getTime();
  if (byStart !== 0) return byStart;

  // Desempate final para a ordem não ficar à mercê do que o banco devolveu
  // primeiro. O id é UUID v7, então o maior é o criado mais recentemente.
  return a.id < b.id ? 1 : -1;
}
