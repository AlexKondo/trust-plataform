import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  AwardedBadgeRow,
  ProfileAccessLogRow,
  ProfileShareRow,
  TrustBadgeRow,
  VisibilityPolicyRow,
  awardedBadges,
  trustBadges,
  trustProfileAccessLogs,
  trustProfileShares,
  trustVisibilityPolicies,
} from './trust-reputation.schema';

@Injectable()
export class TrustReputationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ── Badges (TRS-012/013/014) ────────────────────────────────────────────────
  async listBadges(activeOnly: boolean): Promise<TrustBadgeRow[]> {
    if (activeOnly) {
      return this.db.select().from(trustBadges).where(eq(trustBadges.active, true));
    }
    return this.db.select().from(trustBadges).orderBy(trustBadges.code);
  }

  async findBadge(id: string): Promise<TrustBadgeRow | null> {
    const [row] = await this.db.select().from(trustBadges).where(eq(trustBadges.id, id)).limit(1);
    return row ?? null;
  }

  async upsertBadge(row: TrustBadgeRow): Promise<void> {
    await this.db
      .insert(trustBadges)
      .values(row)
      .onConflictDoUpdate({
        target: trustBadges.id,
        set: {
          name: row.name,
          description: row.description,
          badgeType: row.badgeType,
          criteria: row.criteria,
          active: row.active,
          updatedAt: new Date(),
        },
      });
  }

  async listActiveAwards(
    trustPassportId: string,
    executor?: DatabaseExecutor,
  ): Promise<AwardedBadgeRow[]> {
    const target = executor ?? this.db;
    return target
      .select()
      .from(awardedBadges)
      .where(and(eq(awardedBadges.trustPassportId, trustPassportId), isNull(awardedBadges.revokedAt)));
  }

  async awardBadge(row: AwardedBadgeRow, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(awardedBadges).values(row).onConflictDoNothing();
  }

  async revokeAward(id: string, revokedAt: Date, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.update(awardedBadges).set({ revokedAt }).where(eq(awardedBadges.id, id));
  }

  /** Badges ativos do passport com dados do catálogo (para /me e perfil). */
  async listAwardedWithCatalog(
    trustPassportId: string,
  ): Promise<Array<{ code: string; name: string; description: string; badgeType: string; awardedAt: Date }>> {
    return this.db
      .select({
        code: trustBadges.code,
        name: trustBadges.name,
        description: trustBadges.description,
        badgeType: trustBadges.badgeType,
        awardedAt: awardedBadges.awardedAt,
      })
      .from(awardedBadges)
      .innerJoin(trustBadges, eq(awardedBadges.badgeId, trustBadges.id))
      .where(and(eq(awardedBadges.trustPassportId, trustPassportId), isNull(awardedBadges.revokedAt)))
      .orderBy(awardedBadges.awardedAt);
  }

  // ── Visibilidade (TRS-016) ─────────────────────────────────────────────────
  async findVisibility(trustPassportId: string): Promise<VisibilityPolicyRow | null> {
    const [row] = await this.db
      .select()
      .from(trustVisibilityPolicies)
      .where(eq(trustVisibilityPolicies.trustPassportId, trustPassportId))
      .limit(1);
    return row ?? null;
  }

  async upsertVisibility(row: VisibilityPolicyRow): Promise<void> {
    await this.db
      .insert(trustVisibilityPolicies)
      .values(row)
      .onConflictDoUpdate({
        target: trustVisibilityPolicies.trustPassportId,
        set: {
          showScore: row.showScore,
          showLevel: row.showLevel,
          showBadges: row.showBadges,
          showVerifications: row.showVerifications,
          updatedAt: new Date(),
        },
      });
  }

  // ── Shares (TRS-017/019/020) ───────────────────────────────────────────────
  async createShare(row: ProfileShareRow): Promise<void> {
    await this.db.insert(trustProfileShares).values(row);
  }

  async findShareByTokenHash(tokenHash: string): Promise<ProfileShareRow | null> {
    const [row] = await this.db
      .select()
      .from(trustProfileShares)
      .where(eq(trustProfileShares.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async findShareById(id: string): Promise<ProfileShareRow | null> {
    const [row] = await this.db
      .select()
      .from(trustProfileShares)
      .where(eq(trustProfileShares.id, id))
      .limit(1);
    return row ?? null;
  }

  async listShares(trustPassportId: string): Promise<ProfileShareRow[]> {
    return this.db
      .select()
      .from(trustProfileShares)
      .where(eq(trustProfileShares.trustPassportId, trustPassportId))
      .orderBy(desc(trustProfileShares.createdAt));
  }

  async revokeShare(id: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(trustProfileShares)
      .set({ revokedAt })
      .where(eq(trustProfileShares.id, id));
  }

  async logAccess(row: ProfileAccessLogRow): Promise<void> {
    await this.db.insert(trustProfileAccessLogs).values(row);
  }

  async listAccessHistory(
    shareId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ProfileAccessLogRow[]; totalItems: number }> {
    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(trustProfileAccessLogs)
        .where(eq(trustProfileAccessLogs.shareId, shareId))
        .orderBy(desc(trustProfileAccessLogs.accessedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(trustProfileAccessLogs)
        .where(eq(trustProfileAccessLogs.shareId, shareId)),
    ]);
    return { items, totalItems: total?.count ?? 0 };
  }
}
