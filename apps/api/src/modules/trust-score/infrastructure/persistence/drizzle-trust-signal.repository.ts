import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { TrustSignalRow, trustSignals } from './trust-signal.schema';

@Injectable()
export class TrustSignalRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Idempotent by `sourceEventId` — mirrors `trust_events` (TRS-002). */
  async insertSignal(
    record: Omit<TrustSignalRow, 'createdAt'>,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const inserted = await target
      .insert(trustSignals)
      .values(record)
      .onConflictDoNothing({ target: trustSignals.sourceEventId })
      .returning({ id: trustSignals.id });
    return inserted.length > 0;
  }

  async listByPassportId(
    trustPassportId: string,
    page: number,
    pageSize: number,
    publicOnly: boolean,
  ): Promise<{ items: TrustSignalRow[]; totalItems: number }> {
    const condition = publicOnly
      ? sql`${trustSignals.trustPassportId} = ${trustPassportId} and ${trustSignals.visibility} = 'PUBLIC'`
      : eq(trustSignals.trustPassportId, trustPassportId);

    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(trustSignals)
        .where(condition)
        .orderBy(desc(trustSignals.occurredAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(trustSignals).where(condition),
    ]);
    return { items, totalItems: total?.count ?? 0 };
  }
}
