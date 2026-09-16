import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { assertNoOverlap, PartnerAvailabilityWindow } from '../../domain/entities/partner-availability';
import { PartnerAvailabilityRepository } from '../../domain/repositories/partner-availability.repository';
import { PartnerAvailabilityWindowResponse, SetPartnerAvailabilityRequest } from '../dto/partner-availability.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toAvailabilityWindowResponse } from '../mapper/partner-availability.mapper';

/**
 * IP-005 — o Trust Partner declara QUANDO costuma estar disponível (não uma
 * reação a um pedido específico — isso já existe, `findActiveSchedulingsForSeller`
 * do MRK-019). Escopo deliberadamente pequeno: uma janela semanal recorrente
 * por dia, sem exceções por data/feriado — o mínimo seguro que fecha o gap
 * sem inventar um produto de calendário completo.
 */
@Injectable()
export class ManagePartnerAvailabilityUseCase {
  constructor(
    private readonly repository: PartnerAvailabilityRepository,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Substitui o conjunto inteiro (replace-all, não patch incremental). */
  async replace(
    identityId: string,
    body: SetPartnerAvailabilityRequest,
    meta: RequestMeta = {},
  ): Promise<PartnerAvailabilityWindowResponse[]> {
    const windows = body.windows.map((input) =>
      PartnerAvailabilityWindow.create({ partnerId: identityId, ...input }),
    );
    assertNoOverlap(windows);

    await this.db.transaction(async (tx) => {
      await this.repository.replaceForPartner(identityId, windows, tx);
      await this.auditLogService.record(
        {
          identityId,
          operation: 'SetPartnerAvailability',
          resource: 'PartnerAvailability',
          resourceId: identityId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { windowCount: windows.length },
        },
        tx,
      );
    });

    return windows.map(toAvailabilityWindowResponse);
  }

  async listMine(identityId: string): Promise<PartnerAvailabilityWindowResponse[]> {
    const windows = await this.repository.listByPartner(identityId);
    return windows.map(toAvailabilityWindowResponse);
  }
}
