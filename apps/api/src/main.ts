import 'reflect-metadata';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from './app.module';
import { AppConfigService } from './shared/config/app-config.service';

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ genReqId: () => uuidv7(), trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.register(helmet);

  // Rate limiting por IP (DOC-002: obrigatório em APIs públicas; limite configurável).
  // Lockout por conta é tratado no AuthenticateIdentityUseCase.
  const config = app.get(AppConfigService);
  // CORS: apenas o frontend (APP_BASE_URL) pode chamar a API pelo navegador
  app.enableCors({ origin: config.appBaseUrl, credentials: false });
  // Upload de evidências (VRF-002); limite de tamanho vem da configuração
  await app.register(multipart, {
    limits: { fileSize: config.evidenceMaxFileBytes, files: 1 },
  });
  await app.register(rateLimit, {
    max: config.rateLimitMaxPerMinute,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Try again later.',
      },
    }),
  });

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);
  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
}

if (require.main === module) {
  void bootstrap();
}
