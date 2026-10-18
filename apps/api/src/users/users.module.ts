import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';
import { PASSWORD_HASHER } from './password-hasher.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

/** Contas de acesso. Quem amarra o contrato de hash à implementação concreta é este módulo. */
@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
  ],
})
export class UsersModule {}
