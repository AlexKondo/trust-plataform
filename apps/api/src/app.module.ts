import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './shared/config/app-config.module';
import { LoggerModule } from './shared/logging/logger.module';
import { CorrelationIdMiddleware } from './shared/logging/correlation-id.middleware';
import { DatabaseModule } from './shared/database/database.module';
import { SecurityModule } from './shared/security/security.module';
import { JwtAuthGuard } from './shared/security/jwt-auth.guard';
import { EventsModule } from './shared/events/events.module';
import { AuditModule } from './shared/audit/audit.module';
import { ResponseEnvelopeInterceptor } from './shared/api/response-envelope.interceptor';
import { GlobalExceptionFilter } from './shared/api/global-exception.filter';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { NotificationModule } from './modules/notification/notification.module';
import { TrustPassportModule } from './modules/trust-passport/trust-passport.module';
import { TrustScoreModule } from './modules/trust-score/trust-score.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    SecurityModule,
    EventsModule,
    AuditModule,
    HealthModule,
    IdentityModule,
    TrustPassportModule,
    VerificationModule,
    TrustScoreModule,
    MarketplaceModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '{*splat}' = todas as rotas (sintaxe path-to-regexp v8 do Nest 11).
    // O warning "Unsupported route path" no boot vem da interação prefixo global
    // + middleware e é auto-convertido pelo Nest — cosmético, sem efeito.
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
