import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { CustodyStatus, TrustCustody } from '../../domain/entities/trust-custody';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { TrustCustodyRow, trustCustodies } from './payment.schema';

@Injectable()
export class DrizzleTrustCustodyRepository extends TrustCustodyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  /** Retorna false quando o Payment já tem custódia (PACK-01 §6.2). */
  async create(custody: TrustCustody, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = custody.toProps();
    const inserted = await target
      .insert(trustCustodies)
      .values({
        id: props.id,
        paymentId: props.paymentId,
        orderId: props.orderId,
        buyerId: props.buyerId,
        sellerId: props.sellerId,
        amount: toReaisString(props.amountCents),
        currency: props.currency,
        status: props.status,
        startedAt: props.startedAt,
        releasedAt: props.releasedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      })
      .onConflictDoNothing({ target: trustCustodies.paymentId })
      .returning({ id: trustCustodies.id });
    return inserted.length > 0;
  }

  /** Partes e valores são imutáveis: só o desfecho da custódia muda. */
  async save(custody: TrustCustody, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = custody.toProps();
    await target
      .update(trustCustodies)
      .set({
        status: props.status,
        releasedAt: props.releasedAt,
        updatedAt: props.updatedAt,
      })
      .where(eq(trustCustodies.id, props.id));
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<TrustCustody | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(trustCustodies)
      .where(eq(trustCustodies.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByPaymentId(
    paymentId: string,
    executor?: DatabaseExecutor,
  ): Promise<TrustCustody | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(trustCustodies)
      .where(eq(trustCustodies.paymentId, paymentId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string, executor?: DatabaseExecutor): Promise<TrustCustody | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(trustCustodies)
      .where(eq(trustCustodies.orderId, orderId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async existsByPaymentId(paymentId: string, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const [row] = await target
      .select({ id: trustCustodies.id })
      .from(trustCustodies)
      .where(eq(trustCustodies.paymentId, paymentId))
      .limit(1);
    return Boolean(row);
  }
}

function toDomain(row: TrustCustodyRow): TrustCustody {
  return TrustCustody.restore({
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amountCents: fromReais(row.amount),
    currency: row.currency,
    status: row.status as CustodyStatus,
    startedAt: row.startedAt,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
