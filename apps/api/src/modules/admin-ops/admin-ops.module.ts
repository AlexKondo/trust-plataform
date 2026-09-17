import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SupportLookupService } from './application/support-lookup.service';
import { AdminAuditLogController } from './infrastructure/api/admin-audit-log.controller';
import { AdminSupportController } from './infrastructure/api/admin-support.controller';
import { AdminOpsRepository } from './infrastructure/persistence/admin-ops.repository';

/**
 * IP-018 — Admin, Support & Operations.
 *
 * `IdentityModule` só para resolver `AdminGuard` (mesmo padrão de
 * `AnalyticsModule`/`PaymentModule`). `AdminOpsRepository` lê as tabelas de
 * Identity/Marketplace/Payment diretamente via schema Drizzle (mesmo padrão
 * do `AnalyticsRepository` de IP-020) — zero import de repositório de
 * domínio de outro módulo, zero alteração a `identity/**`/`marketplace/**`/
 * `payment/**` além desta leitura agregada.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AdminAuditLogController, AdminSupportController],
  providers: [AdminOpsRepository, SupportLookupService],
})
export class AdminOpsModule {}
