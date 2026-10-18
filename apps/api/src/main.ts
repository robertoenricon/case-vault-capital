import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Falha no boot, e não na primeira requisição do front: sem a origem
  // autorizada o CORS ficaria permissivo por omissão, que é o pior default.
  const webOrigin = process.env.WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error(
      'WEB_ORIGIN não definida. Copie .env.example para .env antes de subir a API.',
    );
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: webOrigin });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
