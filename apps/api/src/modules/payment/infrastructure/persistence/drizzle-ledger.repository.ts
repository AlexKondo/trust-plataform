import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { LedgerAccount, LedgerDirection, LedgerEntry } from '../../domain/entities/ledger-entry';
import { LedgerAccountBalance, LedgerRepository } from '../../domain/repositories/ledger.repository';
import { LedgerEntryRow, ledgerEntries } from './ledger.schema';

@Injectable()
export class DrizzleLedgerRepository extends LedgerRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async postGroup(entries: readonly LedgerEntry[], executor?: DatabaseExecutor): Promise<number> {
    if (entries.length === 0) {
      return 0;
    }
    const target = executor ?? this.db;
    const inserted = await target
      .insert(ledgerEntries)
      .values(
        entries.map((entry) => {
          const props = entry.toProps();
          return {
            id: props.id,
            sourceEventId: props.sourceEventId,
            sourceEventType: props.sourceEventType,
            sourceAggregateType: props.sourceAggregateType,
            sourceAggregateId: props.sourceAggregateId,
            paymentId: props.paymentId,
            account: props.account,
            direction: props.direction,
            amountCents: String(props.amountCents),
            currency: props.currency,
            postingGroupId: props.postingGroupId,
            createdAt: props.createdAt,
          };
        }),
      )
      // Idempotência de posting (índice único `sourceEventId+account+direction`,
      // ver ledger.schema.ts): reprocessar o mesmo evento não duplica linha.
      .onConflictDoNothing()
      .returning({ id: ledgerEntries.id });
    return inserted.length;
  }

  async listByPayment(paymentId: string): Promise<LedgerEntry[]> {
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId))
      .orderBy(desc(ledgerEntries.createdAt));
    return rows.map(toDomain);
  }

  async sumByPaymentAndAccount(paymentId: string, account: LedgerAccount): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end), 0)`,
      })
      .from(ledgerEntries)
      .where(
        sql`${ledgerEntries.paymentId} = ${paymentId} and ${ledgerEntries.account} = ${account}`,
      );
    return row ? Number(row.total) : 0;
  }

  async totalsByAccount(): Promise<LedgerAccountBalance[]> {
    const rows = await this.db
      .select({
        account: ledgerEntries.account,
        total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end), 0)`,
      })
      .from(ledgerEntries)
      .groupBy(ledgerEntries.account);
    return rows.map((row) => ({
      account: row.account as LedgerAccount,
      balanceCents: Number(row.total),
    }));
  }
}

function toDomain(row: LedgerEntryRow): LedgerEntry {
  return LedgerEntry.restore({
    id: row.id,
    sourceEventId: row.sourceEventId,
    sourceEventType: row.sourceEventType,
    sourceAggregateType: row.sourceAggregateType,
    sourceAggregateId: row.sourceAggregateId,
    paymentId: row.paymentId,
    account: row.account as LedgerAccount,
    direction: row.direction as LedgerDirection,
    amountCents: Number(row.amountCents),
    currency: row.currency.trim(),
    postingGroupId: row.postingGroupId,
    createdAt: row.createdAt,
  });
}
