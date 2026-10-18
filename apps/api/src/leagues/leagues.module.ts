import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  LEAGUE_INITIAL_BALANCE,
  parseInitialBalance,
} from './initial-balance.js';
import { LeaguesController } from './leagues.controller.js';
import { LeaguesRepository } from './leagues.repository.js';
import { LeaguesService } from './leagues.service.js';

/**
 * Ligas: a competição, quem está dentro dela e com quanto cada um começa.
 *
 * Importa `auth` só para proteger as próprias rotas (o guard), `prisma` para o
 * repositório e `users` para saber quem existe (a lista de convite). A seta
 * aponta em um sentido só: contas não conhecem liga, e não há `forwardRef`.
 *
 * O saldo padrão é configuração deste módulo, como o segredo e a validade do
 * token são do `auth`: quem lê o ambiente é o módulo, e o service recebe o
 * valor pronto.
 *
 * A leitura roda na avaliação do módulo, antes de existir requisição: saldo mal
 * configurado impede a API de subir, em vez de virar liga com dinheiro errado
 * na primeira criação. É o mesmo "falhar cedo e alto" do `JWT_SECRET`.
 *
 * Não exporta nada: ninguém depende de liga ainda — quando ordens e ranking
 * existirem, o que eles precisarem sai daqui explicitamente.
 */
@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [LeaguesController],
  providers: [
    LeaguesService,
    LeaguesRepository,
    {
      provide: LEAGUE_INITIAL_BALANCE,
      useValue: parseInitialBalance(process.env.LEAGUE_INITIAL_BALANCE),
    },
  ],
})
export class LeaguesModule {}
