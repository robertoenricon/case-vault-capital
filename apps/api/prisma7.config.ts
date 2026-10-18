import { defineConfig } from 'prisma/config';

// A URL vem do ambiente, nunca do código. Em desenvolvimento quem injeta é o
// docker-compose (serviço `api`, a partir do .env da raiz); em produção, a
// plataforma de deploy.
const url = process.env.DATABASE_URL;

// Falhar aqui, e não no meio de uma migration: sem a URL o Prisma tentaria o
// default dele e a mensagem de erro apontaria para o lugar errado.
if (!url) {
  throw new Error(
    'DATABASE_URL não definida. Rode os comandos do Prisma dentro do container: docker compose exec api npx prisma ...',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
