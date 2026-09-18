import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { CashbackCampaign } from '../../domain/entities/cashback-campaign';
import { PointsEarningRule } from '../../domain/entities/points-earning-rule';
import { PointsLedgerEntry } from '../../domain/entities/points-ledger-entry';
import { ReferralAttribution, ReferralCode } from '../../domain/entities/referral';
import {
  CashbackCampaignRepository,
  PointsEarningRuleRepository,
  PointsLedgerRepository,
  ReferralRepository,
} from '../../domain/repositories/growth.repository';
import {
  CashbackCampaignRow,
  PointsEarningRuleRow,
  PointsLedgerRow,
  ReferralAttributionRow,
  ReferralCodeRow,
  cashbackCampaigns,
  pointsEarningRules,
  pointsLedger,
  referralAttributions,
  referralCodes,
} from './growth.schema';

@Injectable()
export class DrizzlePointsLedgerRepository extends PointsLedgerRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async append(entry: PointsLedgerEntry, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = entry.toProps();
    const inserted = await target
      .insert(pointsLedger)
      .values({
        id: props.id,
        identityId: props.identityId,
        direction: props.direction,
        points: props.points,
        reason: props.reason,
        sourceEventId: props.sourceEventId,
        ruleId: props.ruleId,
        createdAt: props.createdAt,
      })
      .onConflictDoNothing()
      .returning({ id: pointsLedger.id });
    return inserted.length > 0;
  }

  async balanceOf(identityId: string, executor?: DatabaseExecutor): Promise<number> {
    const target = executor ?? this.db;
    const [row] = await target
      .select({
        total: sql<string>`coalesce(sum(case when ${pointsLedger.direction} = 'REDEEM' then -${pointsLedger.points} else ${pointsLedger.points} end), 0)`,
      })
      .from(pointsLedger)
      .where(eq(pointsLedger.identityId, identityId));
    return Number(row?.total ?? 0);
  }

  async listByIdentity(identityId: string): Promise<PointsLedgerEntry[]> {
    const rows = await this.db
      .select()
      .from(pointsLedger)
      .where(eq(pointsLedger.identityId, identityId))
      .orderBy(desc(pointsLedger.createdAt));
    return rows.map(toPointsEntry);
  }

  /**
   * `pg_advisory_xact_lock` sobre o hash da Identity — mesma sessão/transação
   * que fizer a leitura do saldo E a escrita do REDEEM deve chamar isto
   * primeiro. Libera sozinha ao fim da transação (COMMIT ou ROLLBACK), nunca
   * precisa de un-lock manual. `executor` é OBRIGATÓRIO (não `db` solto):
   * um advisory lock fora de uma transação explícita não protege nada.
   */
  async lockIdentityForRedeem(identityId: string, executor: DatabaseExecutor): Promise<void> {
    await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${identityId}))`);
  }
}

@Injectable()
export class DrizzlePointsEarningRuleRepository extends PointsEarningRuleRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(rule: PointsEarningRule): Promise<void> {
    const props = rule.toProps();
    await this.db
      .insert(pointsEarningRules)
      .values(props)
      .onConflictDoUpdate({ target: pointsEarningRules.id, set: props });
  }

  async findActiveByEventName(eventName: string, at: Date): Promise<PointsEarningRule[]> {
    const rows = await this.db
      .select()
      .from(pointsEarningRules)
      .where(and(eq(pointsEarningRules.eventName, eventName), eq(pointsEarningRules.active, true)));
    return rows.map(toRule).filter((rule) => rule.isEffectiveAt(at));
  }

  async listAll(): Promise<PointsEarningRule[]> {
    const rows = await this.db.select().from(pointsEarningRules);
    return rows.map(toRule);
  }
}

@Injectable()
export class DrizzleReferralRepository extends ReferralRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async saveCode(code: ReferralCode): Promise<void> {
    await this.db.insert(referralCodes).values(code.toProps()).onConflictDoNothing();
  }

  async findCodeByIdentity(identityId: string): Promise<ReferralCode | null> {
    const [row] = await this.db.select().from(referralCodes).where(eq(referralCodes.identityId, identityId));
    return row ? toReferralCode(row) : null;
  }

  async findCodeByValue(code: string): Promise<ReferralCode | null> {
    const [row] = await this.db.select().from(referralCodes).where(eq(referralCodes.code, code));
    return row ? toReferralCode(row) : null;
  }

  async saveAttribution(attribution: ReferralAttribution, executor?: DatabaseExecutor): Promise<boolean> {
    const target = executor ?? this.db;
    const props = attribution.toProps();
    // Segunda linha de defesa anti-abuso: `idx_referral_attribution_referred_unique`
    // — a MESMA identidade referida nunca ganha uma segunda linha, mesmo sob corrida.
    const inserted = await target
      .insert(referralAttributions)
      .values(props)
      .onConflictDoNothing()
      .returning({ id: referralAttributions.id });
    return inserted.length > 0;
  }

  async findAttributionByReferred(referredIdentityId: string): Promise<ReferralAttribution | null> {
    const [row] = await this.db
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referredIdentityId, referredIdentityId));
    return row ? toAttribution(row) : null;
  }

  async updateAttribution(attribution: ReferralAttribution, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = attribution.toProps();
    await target
      .update(referralAttributions)
      .set({ status: props.status, confirmedAt: props.confirmedAt })
      .where(eq(referralAttributions.id, props.id));
  }

  async countConfirmedByReferrer(referrerIdentityId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`count(*)` })
      .from(referralAttributions)
      .where(
        and(
          eq(referralAttributions.referrerIdentityId, referrerIdentityId),
          eq(referralAttributions.status, 'CONFIRMED'),
        ),
      );
    return Number(row?.total ?? 0);
  }
}

@Injectable()
export class DrizzleCashbackCampaignRepository extends CashbackCampaignRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(campaign: CashbackCampaign): Promise<void> {
    const props = campaign.toProps();
    await this.db
      .insert(cashbackCampaigns)
      .values(props)
      .onConflictDoUpdate({ target: cashbackCampaigns.id, set: props });
  }

  async findActiveAt(at: Date): Promise<CashbackCampaign[]> {
    const rows = await this.db
      .select()
      .from(cashbackCampaigns)
      .where(
        and(
          eq(cashbackCampaigns.active, true),
          lte(cashbackCampaigns.startsAt, at),
          gte(cashbackCampaigns.endsAt, at),
        ),
      );
    return rows.map(toCampaign);
  }

  async listAll(): Promise<CashbackCampaign[]> {
    const rows = await this.db.select().from(cashbackCampaigns);
    return rows.map(toCampaign);
  }
}

function toPointsEntry(row: PointsLedgerRow): PointsLedgerEntry {
  return PointsLedgerEntry.restore({
    id: row.id,
    identityId: row.identityId,
    direction: row.direction as PointsLedgerEntry['direction'],
    points: row.points,
    reason: row.reason,
    sourceEventId: row.sourceEventId,
    ruleId: row.ruleId,
    createdAt: row.createdAt,
  });
}

function toRule(row: PointsEarningRuleRow): PointsEarningRule {
  return PointsEarningRule.restore({
    id: row.id,
    eventName: row.eventName,
    description: row.description,
    points: row.points,
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toReferralCode(row: ReferralCodeRow): ReferralCode {
  return ReferralCode.restore({ id: row.id, identityId: row.identityId, code: row.code, createdAt: row.createdAt });
}

function toAttribution(row: ReferralAttributionRow): ReferralAttribution {
  return ReferralAttribution.restore({
    id: row.id,
    referralCodeId: row.referralCodeId,
    referrerIdentityId: row.referrerIdentityId,
    referredIdentityId: row.referredIdentityId,
    status: row.status as ReferralAttribution['status'],
    attributedAt: row.attributedAt,
    confirmedAt: row.confirmedAt,
  });
}

function toCampaign(row: CashbackCampaignRow): CashbackCampaign {
  return CashbackCampaign.restore({
    id: row.id,
    name: row.name,
    percentageBps: row.percentageBps,
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
