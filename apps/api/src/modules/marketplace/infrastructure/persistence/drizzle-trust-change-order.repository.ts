import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ChangeOrderEvidenceType,
  ChangeOrderStatus,
  ChangeOrderType,
} from '../../domain/entities/marketplace-types';
import { TrustChangeOrder } from '../../domain/entities/trust-change-order';
import {
  ChangeOrderEvidenceRecord,
  TrustChangeOrderRepository,
} from '../../domain/repositories/trust-change-order.repository';
import {
  TrustChangeOrderEvidenceRow,
  TrustChangeOrderRow,
  trustChangeOrderEvidences,
  trustChangeOrders,
} from './trust-change-order.schema';

@Injectable()
export class DrizzleTrustChangeOrderRepository extends TrustChangeOrderRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async create(changeOrder: TrustChangeOrder, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(trustChangeOrders).values(toRow(changeOrder));
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<TrustChangeOrder | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(trustChangeOrders)
      .where(eq(trustChangeOrders.id, id))
      .limit(1);
    return row ? toChangeOrder(row) : null;
  }

  async listByOrder(orderId: string, executor?: DatabaseExecutor): Promise<TrustChangeOrder[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(trustChangeOrders)
      .where(eq(trustChangeOrders.orderId, orderId))
      .orderBy(asc(trustChangeOrders.createdAt));
    return rows.map(toChangeOrder);
  }

  /**
   * §19 — compare-and-set no status. Os valores comerciais NÃO entram no `set`:
   * depois de criados eles são fatos congelados (§6.1), e um UPDATE que os
   * incluísse abriria caminho para reescrever o passado por engano.
   */
  async saveWithExpectedStatus(
    changeOrder: TrustChangeOrder,
    expectedStatus: ChangeOrderStatus,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const props = changeOrder.toProps();
    const updated = await target
      .update(trustChangeOrders)
      .set({
        status: props.status,
        submittedAt: props.submittedAt,
        decidedAt: props.decidedAt,
        decidedBy: props.decidedBy,
        decisionReason: props.decisionReason,
        updatedAt: props.updatedAt,
      })
      .where(
        and(
          eq(trustChangeOrders.id, props.id),
          eq(trustChangeOrders.status, expectedStatus),
        ),
      )
      .returning({ id: trustChangeOrders.id });
    return updated.length > 0;
  }

  async addEvidence(
    record: ChangeOrderEvidenceRecord,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(trustChangeOrderEvidences).values(record);
  }

  async listEvidences(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<ChangeOrderEvidenceRecord[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(trustChangeOrderEvidences)
      .where(eq(trustChangeOrderEvidences.changeOrderId, changeOrderId))
      .orderBy(asc(trustChangeOrderEvidences.uploadedAt));
    return rows.map(toEvidence);
  }
}

function toRow(changeOrder: TrustChangeOrder): typeof trustChangeOrders.$inferInsert {
  const props = changeOrder.toProps();
  return {
    ...props,
    serviceDeltaAmount: props.serviceDeltaAmount.toFixed(2),
    materialCostDeltaAmount: props.materialCostDeltaAmount.toFixed(2),
    materialMarkupDeltaAmount: props.materialMarkupDeltaAmount.toFixed(2),
    changeGrossAmount: props.changeGrossAmount.toFixed(2),
    changeTrustFeeBaseAmount: props.changeTrustFeeBaseAmount.toFixed(2),
    changeTrustFeeAmount: props.changeTrustFeeAmount.toFixed(2),
    changeProviderNetBeforePspFees: props.changeProviderNetBeforePspFees.toFixed(2),
  };
}

function toChangeOrder(row: TrustChangeOrderRow): TrustChangeOrder {
  return TrustChangeOrder.restore({
    id: row.id,
    orderId: row.orderId,
    proposedBy: row.proposedBy,
    type: row.type as ChangeOrderType,
    status: row.status as ChangeOrderStatus,
    currency: row.currency,
    additionalMinutes: row.additionalMinutes,
    serviceDeltaAmount: Number(row.serviceDeltaAmount),
    materialCostDeltaAmount: Number(row.materialCostDeltaAmount),
    materialMarkupDeltaAmount: Number(row.materialMarkupDeltaAmount),
    trustFeeRateBps: row.trustFeeRateBps,
    changeGrossAmount: Number(row.changeGrossAmount),
    changeTrustFeeBaseAmount: Number(row.changeTrustFeeBaseAmount),
    changeTrustFeeAmount: Number(row.changeTrustFeeAmount),
    changeProviderNetBeforePspFees: Number(row.changeProviderNetBeforePspFees),
    reason: row.reason,
    description: row.description,
    expiresAt: row.expiresAt,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    decisionReason: row.decisionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toEvidence(row: TrustChangeOrderEvidenceRow): ChangeOrderEvidenceRecord {
  return {
    id: row.id,
    changeOrderId: row.changeOrderId,
    type: row.type as ChangeOrderEvidenceType,
    storageKey: row.storageKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    checksum: row.checksum,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
}
