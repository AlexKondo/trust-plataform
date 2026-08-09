import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { LevelRule, ScoreRule } from '../../domain/services/trust-score-engine';
import {
  TrustEventRow,
  TrustLevelRuleRow,
  TrustScoreRow,
  TrustScoreRuleRow,
  trustEvents,
  trustLevelHistory,
  trustLevelRules,
  trustScoreRules,
  trustScores,
} from './trust-score.schema';

@Injectable()
export class TrustScoreRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async createScore(
    row: {
      id: string;
      trustPassportId: string;
      identityId: string;
      level: string;
      calculatedAt: Date;
    },
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const inserted = await target
      .insert(trustScores)
      .values({ ...row, score: 0 })
      .onConflictDoNothing({ target: trustScores.trustPassportId })
      .returning({ id: trustScores.id });
    return inserted.length > 0;
  }

  async findScoreByPassportId(
    trustPassportId: string,
    executor?: DatabaseExecutor,
  ): Promise<TrustScoreRow | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(trustScores)
      .where(eq(trustScores.trustPassportId, trustPassportId))
      .limit(1);
    return row ?? null;
  }

  async findScoreByIdentityId(identityId: string): Promise<TrustScoreRow | null> {
    const [row] = await this.db
      .select()
      .from(trustScores)
      .where(eq(trustScores.identityId, identityId))
      .limit(1);
    return row ?? null;
  }

  async updateScore(
    id: string,
    score: number,
    level: string,
    calculatedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(trustScores)
      .set({ score, level, calculatedAt, updatedAt: calculatedAt })
      .where(eq(trustScores.id, id));
  }

  /** Insere no event store; false se o sourceEventId já foi registrado (idempotência). */
  async insertTrustEvent(
    record: Omit<TrustEventRow, 'createdAt'>,
    executor?: DatabaseExecutor,
  ): Promise<boolean> {
    const target = executor ?? this.db;
    const inserted = await target
      .insert(trustEvents)
      .values(record)
      .onConflictDoNothing({ target: trustEvents.sourceEventId })
      .returning({ id: trustEvents.id });
    return inserted.length > 0;
  }

  async listPoints(trustPassportId: string, executor?: DatabaseExecutor): Promise<number[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select({ points: trustEvents.points })
      .from(trustEvents)
      .where(eq(trustEvents.trustPassportId, trustPassportId));
    return rows.map((row) => row.points);
  }

  async countMatchesByRule(trustPassportId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ruleId: trustEvents.ruleId, count: sql<number>`count(*)::int` })
      .from(trustEvents)
      .where(eq(trustEvents.trustPassportId, trustPassportId))
      .groupBy(trustEvents.ruleId);
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.ruleId) {
        map.set(row.ruleId, row.count);
      }
    }
    return map;
  }

  async listTimeline(
    trustPassportId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: TrustEventRow[]; totalItems: number }> {
    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(trustEvents)
        .where(eq(trustEvents.trustPassportId, trustPassportId))
        .orderBy(desc(trustEvents.occurredAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(trustEvents)
        .where(eq(trustEvents.trustPassportId, trustPassportId)),
    ]);
    return { items, totalItems: total?.count ?? 0 };
  }

  async listActiveScoreRules(): Promise<ScoreRule[]> {
    const rows = await this.db.select().from(trustScoreRules).where(eq(trustScoreRules.active, true));
    return rows.map(toScoreRule);
  }

  async listAllScoreRules(): Promise<TrustScoreRuleRow[]> {
    return this.db.select().from(trustScoreRules).orderBy(trustScoreRules.eventName);
  }

  async upsertScoreRule(row: TrustScoreRuleRow): Promise<void> {
    await this.db
      .insert(trustScoreRules)
      .values(row)
      .onConflictDoUpdate({
        target: trustScoreRules.id,
        set: {
          description: row.description,
          points: row.points,
          conditions: row.conditions,
          maxOccurrences: row.maxOccurrences,
          active: row.active,
          updatedAt: new Date(),
        },
      });
  }

  async findScoreRule(id: string): Promise<TrustScoreRuleRow | null> {
    const [row] = await this.db
      .select()
      .from(trustScoreRules)
      .where(eq(trustScoreRules.id, id))
      .limit(1);
    return row ?? null;
  }

  async listLevelRules(): Promise<LevelRule[]> {
    const rows = await this.db.select().from(trustLevelRules).orderBy(trustLevelRules.rank);
    return rows.map(toLevelRule);
  }

  async listAllLevelRules(): Promise<TrustLevelRuleRow[]> {
    return this.db.select().from(trustLevelRules).orderBy(trustLevelRules.rank);
  }

  async updateLevelRule(
    id: string,
    changes: Partial<Pick<TrustLevelRuleRow, 'minScore' | 'maxScore' | 'active'>>,
  ): Promise<void> {
    await this.db
      .update(trustLevelRules)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(trustLevelRules.id, id));
  }

  async insertLevelHistory(
    row: {
      id: string;
      trustPassportId: string;
      previousLevel: string | null;
      newLevel: string;
      score: number;
      changedAt: Date;
    },
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(trustLevelHistory).values(row);
  }
}

function toScoreRule(row: TrustScoreRuleRow): ScoreRule {
  return {
    id: row.id,
    eventName: row.eventName,
    points: row.points,
    conditions: (row.conditions as ScoreRule['conditions']) ?? [],
    maxOccurrences: row.maxOccurrences,
    active: row.active,
  };
}

function toLevelRule(row: TrustLevelRuleRow): LevelRule {
  return {
    level: row.level,
    minScore: row.minScore,
    maxScore: row.maxScore,
    rank: row.rank,
    active: row.active,
  };
}
