import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../shared/config/app-config.service';
import { CreateIdentityUseCase } from './application/usecases/create-identity.usecase';
import { GenerateEmailVerificationUseCase } from './application/usecases/generate-email-verification.usecase';
import { VerifyEmailUseCase } from './application/usecases/verify-email.usecase';
import { EmailVerificationTokenRepository } from './domain/repositories/email-verification-token.repository';
import { IdentityRepository } from './domain/repositories/identity.repository';
import { EmailService } from './domain/services/email.service';
import { PasswordHashService } from './domain/services/password-hash.service';
import { TokenGeneratorService } from './domain/services/token-generator.service';
import { IdentityController } from './infrastructure/api/identity.controller';
import { BrevoEmailService } from './infrastructure/email/brevo-email.service';
import { LoggingEmailService } from './infrastructure/email/logging-email.service';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzleIdentityRepository } from './infrastructure/persistence/drizzle-identity.repository';
import { Argon2PasswordHashService } from './infrastructure/security/argon2-password-hash.service';
import { CryptoTokenGeneratorService } from './infrastructure/security/crypto-token-generator.service';

const BREVO_REST_KEY_PREFIX = 'xkeysib-';

@Module({
  controllers: [IdentityController],
  providers: [
    CreateIdentityUseCase,
    GenerateEmailVerificationUseCase,
    VerifyEmailUseCase,
    { provide: IdentityRepository, useClass: DrizzleIdentityRepository },
    {
      provide: EmailVerificationTokenRepository,
      useClass: DrizzleEmailVerificationTokenRepository,
    },
    { provide: PasswordHashService, useClass: Argon2PasswordHashService },
    { provide: TokenGeneratorService, useClass: CryptoTokenGeneratorService },
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
  exports: [IdentityRepository, PasswordHashService],
})
export class IdentityModule {}
