import 'reflect-metadata';
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';

async function bootstrap(): Promise<INestApplication> {
  // Falha no boot, e não na primeira requisição do front: sem a origem
  // autorizada o CORS ficaria permissivo por omissão, que é o pior default.
  const webOrigin = process.env.WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error(
      'WEB_ORIGIN não definida. Copie .env.example para .env antes de subir a API.',
    );
  }

  // JWT e saldo são validados ao importar os módulos. Carregá-los durante a
  // requisição permite registrar também essas falhas nos logs da função.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
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

  try {
    await app.init();
    return app;
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}

// Requisições simultâneas compartilham a mesma inicialização. Uma falha de
// conexão permite nova tentativa, sem deixar uma promise rejeitada no cache.
let application: Promise<INestApplication> | undefined;

function getApplication(): Promise<INestApplication> {
  application ??= bootstrap().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  return application;
}

function logStartupError(error: unknown): void {
  let message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  const secrets = [process.env.JWT_SECRET, process.env.DATABASE_URL];
  try {
    const password = new URL(process.env.DATABASE_URL ?? '').password;
    secrets.push(password, decodeURIComponent(password));
  } catch {
    // Uma URL inválida também precisa ser diagnosticada sem expor seu valor.
  }
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, '[REDACTED]');
  }
  console.error('Falha ao inicializar a API:', message);
}

// A Vercel recebe um handler explícito: importar o arquivo não depende do banco
// nem da captura de listen(). A inicialização ocorre dentro da requisição.
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const app = await getApplication();
    const listener: RequestListener = app.getHttpAdapter().getInstance();
    listener(request, response);
  } catch (error) {
    logStartupError(error);
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        statusCode: 503,
        message: 'API indisponível. Tente novamente em instantes.',
      }),
    );
  }
}

if (!process.env.VERCEL) {
  void getApplication()
    .then((app) => app.listen(process.env.PORT ?? 3000))
    .catch((error: unknown) => {
      logStartupError(error);
      process.exitCode = 1;
    });
}
