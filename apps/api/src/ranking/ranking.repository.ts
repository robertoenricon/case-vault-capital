import { Injectable } from '@nestjs/common';
import { BITCOIN } from '../common/assets.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ParticipantHolding } from './league-standings.js';

/**
 * Tudo o que o ranking de uma liga precisa ler do banco, numa consulta só.
 *
 * A base e os participantes vêm juntos de propósito: são duas leituras que
 * precisam concordar entre si — calcular o percentual com a base de uma liga e
 * os saldos de outro instante daria um número que nunca existiu.
 */
export type LeagueStandingsInput = {
  /** Saldo com que todos começaram esta liga, em texto decimal. */
  initialBalance: string;
  /** Participantes **na ordem de entrada na liga**. Ver o `orderBy` abaixo. */
  participants: ParticipantHolding[];
};

/**
 * Coluna `numeric` do Postgres para texto decimal. Mesma função — e mesmos
 * motivos — dos outros repositórios: nada do ORM atravessa daqui para o
 * service, e `toFixed()` sem argumento evita a notação exponencial que o
 * `toString()` do decimal.js produziria em valores extremos.
 */
function toDecimalText(value: Prisma.Decimal): string {
  return value.toFixed();
}

/** Único lugar que fala com o Prisma no módulo de ranking. */
@Injectable()
export class RankingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A liga e **todos** os participantes dela, ou `null` se a liga não existe.
   *
   * Diferente das outras consultas do projeto, esta **não filtra por quem está
   * pedindo** — e não poderia: um ranking com uma linha só não é um ranking. A
   * autorização sai da própria lista, no service: quem pergunta precisa estar
   * entre os devolvidos. É o mesmo desenho já usado na lista de participantes
   * (ver leagues.service.ts), e por isso a verificação não pode ser esquecida
   * sem que a lista inteira apareça para um estranho.
   *
   * `orderBy` por entrada na liga, e não por saldo: quem ordena pelo
   * patrimônio é a regra pura, que precisa de uma **ordem de chegada estável**
   * para desempatar a lista sempre do mesmo jeito. O `id` entra como segundo
   * critério porque dois participantes podem ter o mesmo `joined_at` (quem
   * criou a liga e quem aceitou no mesmo milissegundo) — e, sendo UUID v7, ele
   * já carrega a ordem de criação.
   *
   * Uma consulta só, com nome e posição por join: buscar a carteira de cada
   * participante à parte seriam N+1 idas ao banco para montar uma tela.
   */
  async findLeagueStandings(
    leagueId: string,
  ): Promise<LeagueStandingsInput | null> {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      // `select` explícito, como no resto do projeto: coluna nova no banco não
      // passa a sair da camada de dados sem alguém decidir.
      select: {
        initialBalance: true,
        participants: {
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: {
            userId: true,
            user: { select: { name: true } },
            cashBalance: true,
            // No máximo uma linha: `(participant_id, symbol)` é único.
            positions: { where: { symbol: BITCOIN }, select: { quantity: true } },
          },
        },
      },
    });

    if (!league) return null;

    return {
      initialBalance: toDecimalText(league.initialBalance),
      // Achata o join: nenhuma forma aninhada do Prisma atravessa para o
      // service. A ausência de linha em `positions` vira `"0"` aqui — quem
      // nunca comprou e quem zerou a carteira são o mesmo caso para o ranking,
      // e traduzir isso num lugar só evita que a regra invente o próprio nada.
      participants: league.participants.map((participant) => ({
        userId: participant.userId,
        name: participant.user.name,
        cashBalance: toDecimalText(participant.cashBalance),
        bitcoinQuantity: participant.positions[0]
          ? toDecimalText(participant.positions[0].quantity)
          : '0',
      })),
    };
  }
}
