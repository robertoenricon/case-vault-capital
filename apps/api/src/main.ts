import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';

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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // Sem isto o payload chega como objeto puro: os @Transform do DTO não
      // rodam e o que o tipo promete como number chega como string.
      transform: true,
    }),
  );

  // Erro de regra de negócio vira o status correto. O resto continua no filtro
  // padrão do Nest, que responde 500 sem expor stack trace.
  app.useGlobalFilters(new DomainExceptionFilter());

  // A Vercel intercepta listen() sem executar seu callback. Esperar essa
  // promise aqui travaria a importação do módulo (await bootstrap abaixo).
  // Inicialize antes para garantir que o banco e as rotas já estejam prontos.
  await app.init();
  void app.listen(process.env.PORT ?? 3000).catch((error: unknown) => {
    console.error('Falha ao iniciar o servidor HTTP:', error);
    process.exitCode = 1;
  });
}
await bootstrap();
