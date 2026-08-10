import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { Payment } from '../../domain/entities/payment';
import { PaymentStatus } from '../../domain/entities/payment-types';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentRow, payments } from './payment.schema';

@Injectable()
export class DrizzlePaymentRepository extends PaymentRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  /** Retorna false quando o pedido já tem pagamento (PAY-001 BR-001). */
  async create(payment: Payment, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = payment.toProps();
    const inserted = await target
      .insert(payments)
      .values({
        id: props.id,
        orderId: props.orderId,
        buyerId: props.buyerId,
        sellerId: props.sellerId,
        amount: toReaisString(props.amountCents),
        currency: props.currency,
        status: props.status,
        paymentMethodId: props.paymentMethodId,
        paymentProviderId: props.paymentProviderId,
        refundedAmount: toReaisString(props.refundedCents),
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      })
      .onConflictDoNothing({ target: payments.orderId })
      .returning({ id: payments.id });
    return inserted.length > 0;
  }

  async save(payment: Payment, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = payment.toProps();
    // Valores e partes são imutáveis: só o desfecho financeiro muda.
    await target
      .update(payments)
      .set({
        status: props.status,
        paymentProviderId: props.paymentProviderId,
        paymentMethodId: props.paymentMethodId,
        refundedAmount: toReaisString(props.refundedCents),
        updatedAt: props.updatedAt,
      })
      .where(eq(payments.id, props.id));
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<Payment | null> {
    const target = executor ?? this.db;
    const [row] = await target.select().from(payments).where(eq(payments.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string, executor?: DatabaseExecutor): Promise<Payment | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Payment[]; totalItems: number }> {
    const where = or(eq(payments.buyerId, identityId), eq(payments.sellerId, identityId));
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(payments)
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(where),
    ]);
    return { items: rows.map(toDomain), totalItems: total?.count ?? 0 };
  }
}

function toDomain(row: PaymentRow): Payment {
  return Payment.restore({
    id: row.id,
    orderId: row.orderId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amountCents: fromReais(row.amount),
    // `char(3)` volta com padding do Postgres.
    currency: row.currency.trim(),
    status: row.status as PaymentStatus,
    paymentMethodId: row.paymentMethodId,
    paymentProviderId: row.paymentProviderId,
    refundedCents: fromReais(row.refundedAmount),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
