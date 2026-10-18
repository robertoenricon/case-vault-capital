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

/** O que volta do banco ao criar a conta. Note que `passwordHash` não está aqui. */
export type StoredUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

/**
 * Conta como ela pode ser vista por **outra pessoa**: id e nome, nada mais.
 *
 * O e-mail fica fora do tipo, não só da consulta: assim não existe nem como
 * acrescentá-lo por descuido num `select` depois — o compilador recusaria.
 */
export type PublicUser = {
  id: string;
  name: string;
};

/**
 * Conta + hash da senha, para a conferência de login.
 *
 * É o **único** tipo desta camada que carrega o hash, e existe por um motivo
 * só: comparar senha exige o hash. Quem o recebe é `UsersService`, que o passa
 * direto para o `PasswordHasher` e devolve apenas a identidade da conta — o
 * hash não atravessa a fronteira do módulo e nunca chega perto de uma resposta HTTP.
 */
export type UserCredentials = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
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

  /**
   * Todas as contas, em ordem alfabética, para a lista de quem pode ser
   * convidado a uma liga.
   *
   * O `select` leva **id e nome, nunca o e-mail**: não é esquecimento de campo,
   * é a regra — e-mail de terceiro não sai da aplicação. Como o `select` é
   * explícito, acrescentar coluna no banco não muda o que esta consulta devolve.
   *
   * Sem paginação por decisão registrada: a lista vem inteira. É o que basta
   * para uma liga entre amigos e o que precisa mudar antes de a base crescer —
   * com volume, isto precisa de busca e limite.
   */
  async findAll(): Promise<PublicUser[]> {
    return await this.prisma.user.findMany({
      select: { id: true, name: true },
      // Ordem alfabética para a lista ser percorrível com o olho. É a única
      // ordem útil aqui: não existe "mais relevante" sem amizade nem histórico.
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca a conta pelo e-mail para conferir a senha. `null` quando não existe
   * conta com esse e-mail.
   *
   * O e-mail precisa chegar já normalizado (minúsculas): a coluna tem UNIQUE e o
   * Postgres compara byte a byte, então "Ana@Mail.com" não encontraria nada.
   * Quem normaliza é o service, que é onde essa regra já mora no cadastro.
   */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    // `select` explícito também aqui: o hash sai porque é necessário, não porque
    // o `findUnique` devolve a linha inteira por padrão.
    return await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
  }
}
