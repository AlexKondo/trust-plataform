import { Module } from '@nestjs/common';
import { CreateIdentityUseCase } from './application/usecases/create-identity.usecase';
import { IdentityRepository } from './domain/repositories/identity.repository';
import { PasswordHashService } from './domain/services/password-hash.service';
import { IdentityController } from './infrastructure/api/identity.controller';
import { DrizzleIdentityRepository } from './infrastructure/persistence/drizzle-identity.repository';
import { Argon2PasswordHashService } from './infrastructure/security/argon2-password-hash.service';

@Module({
  controllers: [IdentityController],
  providers: [
    CreateIdentityUseCase,
    { provide: IdentityRepository, useClass: DrizzleIdentityRepository },
    { provide: PasswordHashService, useClass: Argon2PasswordHashService },
  ],
  exports: [IdentityRepository, PasswordHashService],
})
export class IdentityModule {}
