import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../../modules/identity/identity.module';
import { RateLimitService } from './rate-limit.service';
import { RiskFlagService } from './risk-flag.service';
import { RiskFlagController } from './risk-flag.controller';

/**
 * IP-014 — Safety, Abuse & Fraud Controls.
 * Global, no mesmo nível de `AuditModule`: `RateLimitService` e
 * `RiskFlagService` são infraestrutura transversal reutilizada por use
 * cases de módulos de negócio diferentes (Identity, Privacy, Marketplace),
 * não regra de um módulo específico.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [RiskFlagController],
  providers: [RateLimitService, RiskFlagService],
  exports: [RateLimitService, RiskFlagService],
})
export class SafetyModule {}
