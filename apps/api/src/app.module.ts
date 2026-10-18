import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { LeaguesModule } from './leagues/leagues.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [UsersModule, AuthModule, LeaguesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
