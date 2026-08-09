import 'reflect-metadata';
import helmet from '@fastify/helmet';
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
