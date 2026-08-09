import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../shared/config/app-config.service';
import { AuthenticateIdentityUseCase } from './application/usecases/authenticate-identity.usecase';
import { ChangePasswordUseCase } from './application/usecases/change-password.usecase';
import { ForgotPasswordUseCase } from './application/usecases/forgot-password.usecase';
import { GetCurrentIdentityUseCase } from './application/usecases/get-current-identity.usecase';
import { LogoutUseCase } from './application/usecases/logout.usecase';
import { RefreshSessionUseCase } from './application/usecases/refresh-session.usecase';
import { ResetPasswordUseCase } from './application/usecases/reset-password.usecase';
import { CreateIdentityUseCase } from './application/usecases/create-identity.usecase';
import { GenerateEmailVerificationUseCase } from './application/usecases/generate-email-verification.usecase';
import { VerifyEmailUseCase } from './application/usecases/verify-email.usecase';
import { EmailVerificationTokenRepository } from './domain/repositories/email-verification-token.repository';
import { IdentityRepository } from './domain/repositories/identity.repository';
import { PasswordResetTokenRepository } from './domain/repositories/password-reset-token.repository';
import { SessionRepository } from './domain/repositories/session.repository';
import { EmailService } from './domain/services/email.service';
import { PasswordBreachService } from './domain/services/password-breach.service';
import { PasswordHashService } from './domain/services/password-hash.service';
import { TokenGeneratorService } from './domain/services/token-generator.service';
import { AuthController } from './infrastructure/api/auth.controller';
import { IdentityController } from './infrastructure/api/identity.controller';
import { BrevoEmailService } from './infrastructure/email/brevo-email.service';
import { LoggingEmailService } from './infrastructure/email/logging-email.service';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzleIdentityRepository } from './infrastructure/persistence/drizzle-identity.repository';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { AdminGuard } from './infrastructure/security/admin.guard';
import { Argon2PasswordHashService } from './infrastructure/security/argon2-password-hash.service';
import { CryptoTokenGeneratorService } from './infrastructure/security/crypto-token-generator.service';
import { HibpPasswordBreachService } from './infrastructure/security/hibp-password-breach.service';
import { NoopPasswordBreachService } from './infrastructure/security/noop-password-breach.service';

const BREVO_REST_KEY_PREFIX = 'xkeysib-';

@Module({
  controllers: [IdentityController, AuthController],
  providers: [
    CreateIdentityUseCase,
    GenerateEmailVerificationUseCase,
    VerifyEmailUseCase,
    AuthenticateIdentityUseCase,
    RefreshSessionUseCase,
    GetCurrentIdentityUseCase,
    LogoutUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    ChangePasswordUseCase,
    AdminGuard,
    { provide: IdentityRepository, useClass: DrizzleIdentityRepository },
    { provide: SessionRepository, useClass: DrizzleSessionRepository },
    { provide: PasswordResetTokenRepository, useClass: DrizzlePasswordResetTokenRepository },
    {
      provide: EmailVerificationTokenRepository,
      useClass: DrizzleEmailVerificationTokenRepository,
    },
    { provide: PasswordHashService, useClass: Argon2PasswordHashService },
    { provide: TokenGeneratorService, useClass: CryptoTokenGeneratorService },
    {
      provide: PasswordBreachService,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger) =>
        config.passwordBreachCheckEnabled
          ? new HibpPasswordBreachService(logger)
          : new NoopPasswordBreachService(),
    },
    {
      // Brevo REST exige chave xkeysib-; sem ela, loga o link em vez de enviar
      provide: EmailService,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger) =>
        config.brevoApiKey?.startsWith(BREVO_REST_KEY_PREFIX)
          ? new BrevoEmailService(config, logger)
          : new LoggingEmailService(logger),
    },
  ],
  exports: [IdentityRepository, SessionRepository, PasswordHashService, AdminGuard],
})
export class IdentityModule {}
