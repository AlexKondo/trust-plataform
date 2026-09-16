import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { RequestMeta } from '../dto/marketplace.dtos';
import {
  CancelServiceRequestRequest,
  CloseServiceRequestRequest,
  ServiceRequestResponse,
} from '../dto/service-request.dtos';
import { toServiceRequestResponse } from '../mapper/service-request.mapper';
import { SVR_PRODUCER } from './create-service-request.usecase';

/** O Member fecha o pedido (ex.: achou o Partner certo, resolveu por conta própria). */
@Injectable()
export class CloseServiceRequestUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CloseServiceRequestUseCase.name);
  }

  async execute(
    memberId: string,
    serviceRequestId: string,
    body: CloseServiceRequestRequest,
    meta: RequestMeta = {},
  ): Promise<ServiceRequestResponse> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }
    const previousStatus = request.status;
    request.close(memberId, body.reason ?? null);

    await this.db.transaction(async (tx) => {
      await this.serviceRequestRepository.save(request, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'ServiceRequest.Closed',
        aggregateType: 'ServiceRequest',
        aggregateId: request.id,
        producer: SVR_PRODUCER,
        correlationId: meta.correlationId ?? request.id,
        payload: {
          serviceRequestId: request.id,
          memberId,
          previousStatus,
          closedAt: request.closedAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: memberId,
          operation: 'CloseServiceRequest',
          resource: 'ServiceRequest',
          resourceId: request.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { previousStatus, reason: request.closeReason },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CloseServiceRequest',
        identityId: memberId,
        serviceRequestId: request.id,
        previousStatus,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Service request closed.',
    );

    const category = await this.listingRepository.findCategoryById(request.categoryId);
    return toServiceRequestResponse(request, category);
  }
}

/** O Member desiste do pedido; motivo obrigatório (mesmo padrão de MarketplaceOrder.cancel). */
@Injectable()
export class CancelServiceRequestUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CancelServiceRequestUseCase.name);
  }

  async execute(
    memberId: string,
    serviceRequestId: string,
    body: CancelServiceRequestRequest,
    meta: RequestMeta = {},
  ): Promise<ServiceRequestResponse> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }
    const previousStatus = request.status;
    request.cancel(memberId, body.reason);

    await this.db.transaction(async (tx) => {
      await this.serviceRequestRepository.save(request, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'ServiceRequest.Cancelled',
        aggregateType: 'ServiceRequest',
        aggregateId: request.id,
        producer: SVR_PRODUCER,
        correlationId: meta.correlationId ?? request.id,
        payload: {
          serviceRequestId: request.id,
          memberId,
          previousStatus,
          reason: request.cancellationReason,
          cancelledAt: request.cancelledAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: memberId,
          operation: 'CancelServiceRequest',
          resource: 'ServiceRequest',
          resourceId: request.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { previousStatus, reason: request.cancellationReason },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CancelServiceRequest',
        identityId: memberId,
        serviceRequestId: request.id,
        previousStatus,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Service request cancelled.',
    );

    const category = await this.listingRepository.findCategoryById(request.categoryId);
    return toServiceRequestResponse(request, category);
  }
}
