import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Única porta de entrada do Prisma na aplicação. Os repositórios dependem deste
 * provider; nenhum service de domínio o conhece.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // O Prisma 7 não aceita mais a URL pelo schema: o client exige um driver
    // adapter montado pela aplicação. Ler a env aqui mantém o segredo fora do
    // código e falha no boot, não na primeira requisição.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL não definida. Suba a API pelo docker compose, que injeta a variável a partir do .env da raiz.',
      );
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Conectar no boot em vez de na primeira query: banco fora do ar aparece
  // como falha de subida, não como erro na primeira tentativa de cadastro.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
