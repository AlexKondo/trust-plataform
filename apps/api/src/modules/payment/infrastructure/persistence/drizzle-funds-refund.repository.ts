import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { FundsRefund } from '../../domain/entities/funds-refund';
import { RefundReason, RefundStatus } from '../../domain/entities/funds-refund';
import { FundsRefundRepository } from '../../domain/repositories/funds-refund.repository';
import { FundsRefundRow, fundsRefunds } from './funds-refund.schema';

@Injectable()
export class DrizzleFundsRefundRepository extends FundsRefundRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  /** Retorna false quando a chave de idempotência já existe (idempotência, PAY-006 BR-005). */
  async create(refund: FundsRefund, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = refund.toProps();
    const inserted = await target
      .insert(fundsRefunds)
      .values({
        id: props.id,
        paymentId: props.paymentId,
        orderId: props.orderId,
        amount: toReaisString(props.amountCents),
        currency: props.currency,
        reason: props.reason,
        reasonDetail: props.reasonDetail,
        requestedBy: props.requestedBy,
        disputeId: props.disputeId,
        status: props.status,
        providerId: props.providerId,
        idempotencyKey: props.idempotencyKey,
        providerRefundId: props.providerRefundId,
        providerCode: props.providerCode,
        message: props.message,
        gatewayResponse: props.gatewayResponse,
        requestedAt: props.requestedAt,
        completedAt: props.completedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      })
      // Sem target: tanto a PK quanto `idx_funds_refund_idempotency` protegem
      // a mesma corrida (mesmo bug/correção documentado no Completion Report
      // do IP-007 §10.4 — um target nomeado só suprime conflito NAQUELE índice).
      .onConflictDoNothing()
      .returning({ id: fundsRefunds.id });
    return inserted.length > 0;
  }

  async save(refund: FundsRefund, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = refund.toProps();
    await target
      .update(fundsRefunds)
      .set({
        status: props.status,
        providerRefundId: props.providerRefundId,
        providerCode: props.providerCode,
        message: props.message,
        gatewayResponse: props.gatewayResponse,
        completedAt: props.completedAt,
        updatedAt: props.updatedAt,
      })
      .where(eq(fundsRefunds.id, props.id));
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<FundsRefund | null> {
    const target = executor ?? this.db;
    const [row] = await target.select().from(fundsRefunds).where(eq(fundsRefunds.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<FundsRefund | null> {
    const [row] = await this.db
      .select()
      .from(fundsRefunds)
      .where(eq(fundsRefunds.idempotencyKey, key))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listByPayment(paymentId: string): Promise<FundsRefund[]> {
    const rows = await this.db
      .select()
      .from(fundsRefunds)
      .where(eq(fundsRefunds.paymentId, paymentId))
      .orderBy(desc(fundsRefunds.createdAt));
    return rows.map(toDomain);
  }

  async listByOrder(orderId: string): Promise<FundsRefund[]> {
    const rows = await this.db
      .select()
      .from(fundsRefunds)
      .where(eq(fundsRefunds.orderId, orderId))
      .orderBy(desc(fundsRefunds.createdAt));
    return rows.map(toDomain);
  }

  async sumCompletedByPayment(paymentId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${fundsRefunds.amount}), 0)` })
      .from(fundsRefunds)
      .where(sql`${fundsRefunds.paymentId} = ${paymentId} and ${fundsRefunds.status} = 'COMPLETED'`);
    return row ? fromReais(row.total) : 0;
  }
}

function toDomain(row: FundsRefundRow): FundsRefund {
  return FundsRefund.restore({
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    amountCents: fromReais(row.amount),
    currency: row.currency.trim(),
    reason: row.reason as RefundReason,
    reasonDetail: row.reasonDetail,
    requestedBy: row.requestedBy,
    disputeId: row.disputeId,
    status: row.status as RefundStatus,
    providerId: row.providerId,
    idempotencyKey: row.idempotencyKey,
    providerRefundId: row.providerRefundId,
    providerCode: row.providerCode,
    message: row.message,
    gatewayResponse: (row.gatewayResponse as Record<string, unknown>) ?? {},
    requestedAt: row.requestedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
