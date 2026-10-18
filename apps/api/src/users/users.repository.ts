import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailAlreadyInUseError } from './users.errors.js';

/** O que o domínio manda gravar. A senha já chega como hash: o repositório não sabe hashear. */
export type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
};

/** O que volta do banco. Note que `passwordHash` não está aqui — nem sai da camada de dados. */
export type StoredUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

/** Violação de índice único no Postgres, pelo código de erro do Prisma. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Único lugar que fala com o Prisma no módulo. Também é aqui que erro de ORM
 * vira erro de domínio: nenhum tipo do Prisma vaza para o service.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: NewUser): Promise<StoredUser> {
    try {
      // `select` explícito: o hash da senha não é selecionado, então não há
      // como ele escapar por esquecimento na serialização da resposta.
      return await this.prisma.user.create({
        data: user,
        select: { id: true, name: true, email: true, createdAt: true },
      });
    } catch (error) {
      // Quem garante a unicidade é o índice do banco, não um SELECT antes do
      // INSERT: dois cadastros simultâneos com o mesmo e-mail passariam pela
      // verificação prévia e um dos dois quebraria no commit.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new EmailAlreadyInUseError(user.email);
      }
      throw error;
    }
  }
}
