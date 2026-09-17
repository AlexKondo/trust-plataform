import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { AdminOpsRepository } from '../persistence/admin-ops.repository';

const querySchema = z.object({
  identityId: z.string().uuid().optional(),
  operation: z.string().trim().min(1).max(120).optional(),
  resource: z.string().trim().min(1).max(120).optional(),
  correlationId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * IP-018 — fecha o gap "audit exploration": `audit_logs` existe desde
 * IP-000 mas nunca teve superfície de consulta (só `AuditLogService.record`/
 * `.recordSafe`). Só leitura, `AdminGuard`; nenhuma escrita/edição — a
 * trilha continua append-only e imutável (trigger de banco).
 */
@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AdminAuditLogController {
  constructor(private readonly repo: AdminOpsRepository) {}

  @Get()
  async search(@Query(new ZodValidationPipe(querySchema)) query: z.infer<typeof querySchema>) {
    const { page, size, ...filter } = query;
    return this.repo.searchAuditLogs(filter, page, size);
  }
}
