import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LeaguesController } from './leagues.controller.js';
import { LeaguesRepository } from './leagues.repository.js';
import { LeaguesService } from './leagues.service.js';

/**
 * Ligas: a competição e quem está dentro dela.
 *
 * Importa `auth` só para proteger as próprias rotas (o guard), e `prisma` para
 * o repositório. Não exporta nada: ninguém depende de liga ainda — quando
 * ordens e ranking existirem, o que eles precisarem sai daqui explicitamente.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LeaguesController],
  providers: [LeaguesService, LeaguesRepository],
})
export class LeaguesModule {}
