import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QuotesModule } from '../quotes/quotes.module.js';
import { RankingController } from './ranking.controller.js';
import { RankingRepository } from './ranking.repository.js';
import { RankingService } from './ranking.service.js';

/**
 * Ranking: quem está ganhando a liga.
 *
 * Importa `auth` (o guard), `prisma` (o repositório) e `quotes` (o preço, pela
 * interface). As três setas apontam para fora e nenhuma volta — sem
 * `forwardRef`.
 *
 * **Não importa `leagues` nem `orders`**, e isso é escolha. O que vem deles
 * vem como **código**, não como provider: o erro `NotALeagueParticipantError`
 * e as funções puras `orderCost` e `isPositiveAmount`. São regra e vocabulário
 * compartilhados — reescrevê-los aqui daria duas definições de "não participa
 * desta liga" e duas regras de truncamento, que um dia discordariam. É a mesma
 * precedente do `leagueStatusAt`, que o módulo de ordens já usa assim.
 *
 * Leitura pura: este módulo não escreve nada. Por isso não há transação aqui,
 * ao contrário de `orders` — e por isso ele pode ler `leagues` e
 * `league_participants` sem o cuidado que a execução de ordem exige.
 *
 * Não exporta nada: ninguém depende do ranking.
 */
@Module({
  imports: [PrismaModule, AuthModule, QuotesModule],
  controllers: [RankingController],
  providers: [RankingService, RankingRepository],
})
export class RankingModule {}
