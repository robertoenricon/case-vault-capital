import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QuotesModule } from '../quotes/quotes.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * Ordens: comprar e vender cripto com o dinheiro fictício da liga.
 *
 * Importa `auth` (o guard), `prisma` (o repositório) e `quotes` (o preço, pela
 * interface). As três setas apontam para fora deste módulo e nenhuma volta —
 * não há `forwardRef`.
 *
 * **Não importa `leagues`**, e isso é escolha. A transação precisa ler e
 * debitar `league_participants` atomicamente; delegar essa escrita ao módulo
 * de ligas exigiria passar o client da transação entre módulos, e o limite da
 * transação vazaria para fora daqui. Então o repositório de ordens escreve
 * naquela tabela diretamente.
 *
 * O que vem de `leagues` vem como **código**, não como provider: a função pura
 * `leagueStatusAt` e os erros de domínio. São regra e vocabulário
 * compartilhados — reescrevê-los aqui daria duas definições de "liga em
 * andamento", que um dia discordariam.
 *
 * Não exporta nada: ninguém depende de ordens ainda. Quando o ranking existir,
 * o que ele precisar sai daqui explicitamente.
 */
@Module({
  imports: [PrismaModule, AuthModule, QuotesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
