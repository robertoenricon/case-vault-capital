import { defineConfig } from 'prisma/config';

// A URL vem do ambiente, nunca do código. Em desenvolvimento quem injeta é o
// docker-compose (serviço `api`, a partir do .env da raiz); em produção, a
// plataforma de deploy.
const url = process.env.DATABASE_URL;

// Gerar o client no build não depende de um banco provisionado. A API exige
// DATABASE_URL ao iniciar, e o Prisma exige a URL ao executar migrations.

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: url ? { url } : undefined,
});
