import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { ServiceRequest } from '../../domain/entities/service-request';
import { SERVICE_REQUEST_STATUS, ServiceRequestStatus, UrgencyLevel } from '../../domain/entities/marketplace-types';
import {
  ServiceRequestEngagementRecord,
  ServiceRequestRepository,
} from '../../domain/repositories/service-request.repository';
import {
  ServiceRequestEngagementRow,
  ServiceRequestRow,
  serviceRequestEngagements,
  serviceRequests,
} from './service-request.schema';

@Injectable()
export class DrizzleServiceRequestRepository extends ServiceRequestRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(request: ServiceRequest, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = request.toProps();
    const values = {
      id: props.id,
      memberId: props.memberId,
      categoryId: props.categoryId,
      title: props.title,
      description: props.description,
      locationLabel: props.locationLabel,
      radiusKm: props.radiusKm,
      urgency: props.urgency,
      preferredDate: props.preferredDate,
      budgetMinAmount: props.budgetMinAmount === null ? null : props.budgetMinAmount.toFixed(2),
      budgetMaxAmount: props.budgetMaxAmount === null ? null : props.budgetMaxAmount.toFixed(2),
      currency: props.currency,
      minimumTrustLevel: props.minimumTrustLevel,
      status: props.status,
      expiresAt: props.expiresAt,
      matchedAt: props.matchedAt,
      closedAt: props.closedAt,
      closedBy: props.closedBy,
      closeReason: props.closeReason,
      cancelledAt: props.cancelledAt,
      cancelledBy: props.cancelledBy,
      cancellationReason: props.cancellationReason,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
    await target
      .insert(serviceRequests)
      .values(values)
      .onConflictDoUpdate({
        target: serviceRequests.id,
        set: {
          status: values.status,
          matchedAt: values.matchedAt,
          closedAt: values.closedAt,
          closedBy: values.closedBy,
          closeReason: values.closeReason,
          cancelledAt: values.cancelledAt,
          cancelledBy: values.cancelledBy,
          cancellationReason: values.cancellationReason,
          updatedAt: values.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<ServiceRequest | null> {
    const [row] = await this.db.select().from(serviceRequests).where(eq(serviceRequests.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByOwner(
    memberId: string,
    page: number,
    pageSize: number,
    executor?: DatabaseExecutor,
  ): Promise<{ items: ServiceRequest[]; totalItems: number }> {
    const target = executor ?? this.db;
    const where = eq(serviceRequests.memberId, memberId);
    const [rows, [total]] = await Promise.all([
      target
        .select()
        .from(serviceRequests)
        .where(where)
        .orderBy(desc(serviceRequests.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      target.select({ count: sql<number>`count(*)::int` }).from(serviceRequests).where(where),
    ]);
    return { items: rows.map(toDomain), totalItems: total?.count ?? 0 };
  }

  /**
   * IP-003 — compare-and-set no status (mesma técnica de
   * `saveWithExpectedStatus`/`closePauseIfOpen`, PACK-03/IP-001): só grava
   * MATCHED se ainda estava OPEN no banco. Retornar `false` numa corrida NÃO é
   * erro — `ServiceRequest.markMatched` já trata isso como idempotente.
   */
  async markMatchedIfOpen(id: string, matchedAt: Date, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const updated = await target
      .update(serviceRequests)
      .set({ status: SERVICE_REQUEST_STATUS.MATCHED, matchedAt, updatedAt: matchedAt })
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.status, SERVICE_REQUEST_STATUS.OPEN)))
      .returning({ id: serviceRequests.id });
    return updated.length > 0;
  }

  async findEngagement(
    serviceRequestId: string,
    listingId: string,
  ): Promise<ServiceRequestEngagementRecord | null> {
    const [row] = await this.db
      .select()
      .from(serviceRequestEngagements)
      .where(
        and(
          eq(serviceRequestEngagements.serviceRequestId, serviceRequestId),
          eq(serviceRequestEngagements.listingId, listingId),
        ),
      )
      .limit(1);
    return row ? toEngagement(row) : null;
  }

  /** `onConflictDoNothing` sem target — mesma correção do IP-007 (§10.4): qualquer
   * constraint única na tabela deve suprimir o conflito, não só a nomeada. */
  async saveEngagement(
    record: ServiceRequestEngagementRecord,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const inserted = await target
      .insert(serviceRequestEngagements)
      .values(record)
      .onConflictDoNothing()
      .returning({ id: serviceRequestEngagements.id });
    return inserted.length > 0;
  }

  async listEngagements(serviceRequestId: string): Promise<ServiceRequestEngagementRecord[]> {
    const rows = await this.db
      .select()
      .from(serviceRequestEngagements)
      .where(eq(serviceRequestEngagements.serviceRequestId, serviceRequestId))
      .orderBy(asc(serviceRequestEngagements.engagedAt));
    return rows.map(toEngagement);
  }
}

function toDomain(row: ServiceRequestRow): ServiceRequest {
  return ServiceRequest.restore({
    id: row.id,
    memberId: row.memberId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description,
    locationLabel: row.locationLabel,
    radiusKm: row.radiusKm,
    urgency: row.urgency as UrgencyLevel,
    preferredDate: row.preferredDate,
    budgetMinAmount: row.budgetMinAmount === null ? null : Number(row.budgetMinAmount),
    budgetMaxAmount: row.budgetMaxAmount === null ? null : Number(row.budgetMaxAmount),
    currency: row.currency,
    minimumTrustLevel: row.minimumTrustLevel,
    status: row.status as ServiceRequestStatus,
    expiresAt: row.expiresAt,
    matchedAt: row.matchedAt,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    closeReason: row.closeReason,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toEngagement(row: ServiceRequestEngagementRow): ServiceRequestEngagementRecord {
  return {
    id: row.id,
    serviceRequestId: row.serviceRequestId,
    listingId: row.listingId,
    partnerId: row.partnerId,
    conversationId: row.conversationId,
    engagedBy: row.engagedBy,
    engagedAt: row.engagedAt,
  };
}
