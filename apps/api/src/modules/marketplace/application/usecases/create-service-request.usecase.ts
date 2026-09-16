import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { ServiceRequest } from '../../domain/entities/service-request';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { RequestMeta } from '../dto/marketplace.dtos';
import { CreateServiceRequestRequest, ServiceRequestResponse } from '../dto/service-request.dtos';
import { toServiceRequestResponse } from '../mapper/service-request.mapper';
import { resolveCategory } from './create-listing.usecase';

export const SVR_PRODUCER = 'marketplace-service';

/**
 * IP-003 — Member descreve uma necessidade. Reaproveita `resolveCategory`
 * (create-listing.usecase.ts) verbatim: mesmo vocabulário de categoria por
 * código, mesma regra (categoria inexistente/inativa é erro de negócio).
 * Diferente do MRK-001 (anúncio), este agregado nasce completo e já OPEN —
 * não existe rascunho aqui (ver comentário em service-request.ts).
 */
@Injectable()
export class CreateServiceRequestUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateServiceRequestUseCase.name);
  }

  async execute(
    memberId: string,
    body: CreateServiceRequestRequest,
    meta: RequestMeta = {},
  ): Promise<ServiceRequestResponse> {
    const category = await resolveCategory(this.listingRepository, body.category);

    const request = ServiceRequest.create({
      memberId,
      categoryId: category!.id,
      title: body.title,
      description: body.description,
      locationLabel: body.locationLabel,
      radiusKm: body.radiusKm ?? null,
      urgency: body.urgency,
      preferredDate: body.preferredDate ?? null,
      budgetMinAmount: body.budgetMinAmount ?? null,
      budgetMaxAmount: body.budgetMaxAmount ?? null,
      currency: body.currency,
      minimumTrustLevel: body.minimumTrustLevel ?? null,
    });

    await this.db.transaction(async (tx) => {
      await this.serviceRequestRepository.save(request, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'ServiceRequest.Created',
        aggregateType: 'ServiceRequest',
        aggregateId: request.id,
        producer: SVR_PRODUCER,
        correlationId: meta.correlationId ?? request.id,
        payload: {
          serviceRequestId: request.id,
          memberId,
          category: category!.code,
          locationLabel: request.locationLabel,
          urgency: request.urgency,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: memberId,
          operation: 'CreateServiceRequest',
          resource: 'ServiceRequest',
          resourceId: request.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { category: category!.code, urgency: request.urgency },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CreateServiceRequest',
        identityId: memberId,
        serviceRequestId: request.id,
        category: category!.code,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Service request created.',
    );

    return toServiceRequestResponse(request, category);
  }
}
