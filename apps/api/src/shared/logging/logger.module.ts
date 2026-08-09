import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { requestIdOf, resolveCorrelationId } from './correlation';

export const SERVICE_NAME = 'trust-api';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          messageKey: 'message',
          timestamp: stdTimeFunctions.isoTime,
          formatters: {
            level: (label) => ({ level: label.toUpperCase() }),
          },
          base: {
            service: SERVICE_NAME,
            environment: config.nodeEnv,
          },
          customProps: (req) => ({
            requestId: requestIdOf(req),
            correlationId: resolveCorrelationId(req),
          }),
          customAttributeKeys: {
            responseTime: 'durationMs',
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-supabase-key"]',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: {
            ignore: (req) => req.url === '/api/v1/health',
          },
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, messageKey: 'message' },
              },
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
