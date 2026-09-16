import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { fromReais, toReaisString } from '../../../../shared/money/money';
import { CUSTODY_STATUS, CustodyStatus } from '../../domain/entities/trust-custody';
import { IncrementalTrustCustody } from '../../domain/entities/incremental-trust-custody';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { IncrementalTrustCustodyRow, incrementalTrustCustodies } from './payment-incremental.schema';

@Injectable()
export class DrizzleIncrementalTrustCustodyRepository extends IncrementalTrustCustodyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  /** Retorna false quando o Change Order já tem tranche de custódia (idempotência). */
  async create(custody: IncrementalTrustCustody, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = custody.toProps();
    const inserted = await target
      .insert(incrementalTrustCustodies)
      .values({
        id: props.id,
        paymentId: props.paymentId,
        orderId: props.orderId,
        changeOrderId: props.changeOrderId,
        incrementalAuthorizationId: props.incrementalAuthorizationId,
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
      .onConflictDoNothing()
      .returning({ id: incrementalTrustCustodies.id });
    return inserted.length > 0;
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<IncrementalTrustCustody | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByChangeOrderId(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.changeOrderId, changeOrderId))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async listByOrderId(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.orderId, orderId));
    return rows.map(toDomain);
  }

  async listByPaymentId(
    paymentId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.paymentId, paymentId));
    return rows.map(toDomain);
  }

  /**
   * CAS fase 1 (mesmo padrão de `closePauseIfOpen`, IP-001): `UPDATE ... WHERE
   * status = 'IN_CUSTODY'`. Duas liberações concorrentes da mesma tranche —
   * só uma grava; a outra recebe `false` e não reaplica o efeito.
   */
  async markReadyForReleaseIfInCustody(
    id: string,
    now: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const updated = await target
      .update(incrementalTrustCustodies)
      .set({ status: CUSTODY_STATUS.READY_FOR_RELEASE, updatedAt: now })
      .where(
        and(
          eq(incrementalTrustCustodies.id, id),
          eq(incrementalTrustCustodies.status, CUSTODY_STATUS.IN_CUSTODY),
        ),
      )
      .returning({ id: incrementalTrustCustodies.id });
    return updated.length > 0;
  }

  /** CAS fase 2 — só grava RELEASED se o estado no banco ainda for READY_FOR_RELEASE. */
  async markReleasedIfReady(
    id: string,
    releasedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const updated = await target
      .update(incrementalTrustCustodies)
      .set({ status: CUSTODY_STATUS.RELEASED, releasedAt, updatedAt: releasedAt })
      .where(
        and(
          eq(incrementalTrustCustodies.id, id),
          eq(incrementalTrustCustodies.status, CUSTODY_STATUS.READY_FOR_RELEASE),
        ),
      )
      .returning({ id: incrementalTrustCustodies.id });
    return updated.length > 0;
  }

  /** IP-008 — CAS: só grava REFUNDED se o banco ainda disser IN_CUSTODY. */
  async markRefundedIfInCustody(
    id: string,
    now: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const updated = await target
      .update(incrementalTrustCustodies)
      .set({ status: CUSTODY_STATUS.REFUNDED, updatedAt: now })
      .where(
        and(
          eq(incrementalTrustCustodies.id, id),
          eq(incrementalTrustCustodies.status, CUSTODY_STATUS.IN_CUSTODY),
        ),
      )
      .returning({ id: incrementalTrustCustodies.id });
    return updated.length > 0;
  }
}

function toDomain(row: IncrementalTrustCustodyRow): IncrementalTrustCustody {
  return IncrementalTrustCustody.restore({
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    changeOrderId: row.changeOrderId,
    incrementalAuthorizationId: row.incrementalAuthorizationId,
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
