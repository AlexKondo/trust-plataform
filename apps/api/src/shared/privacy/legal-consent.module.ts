import { Global, Module } from '@nestjs/common';
import { LegalConsentService } from './legal-consent.service';

/**
 * IP-021 — mesmo padrão de `AuditModule`/`StorageModule`: infraestrutura
 * transversal, disponível em qualquer módulo sem import explícito.
 */
@Global()
@Module({
  providers: [LegalConsentService],
  exports: [LegalConsentService],
})
export class LegalConsentModule {}
