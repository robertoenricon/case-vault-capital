import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { LeaguesController } from './leagues.controller.js';
import { LeaguesRepository } from './leagues.repository.js';
import { LeaguesService } from './leagues.service.js';

/**
 * Ligas: a competição e quem está dentro dela.
 *
 * Importa `auth` só para proteger as próprias rotas (o guard), `prisma` para o
 * repositório e `users` para saber quem existe (a lista de convite). A seta
 * aponta em um sentido só: contas não conhecem liga, e não há `forwardRef`.
 *
 * Não exporta nada: ninguém depende de liga ainda — quando ordens e ranking
 * existirem, o que eles precisarem sai daqui explicitamente.
 */
@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [LeaguesController],
  providers: [LeaguesService, LeaguesRepository],
})
export class LeaguesModule {}
