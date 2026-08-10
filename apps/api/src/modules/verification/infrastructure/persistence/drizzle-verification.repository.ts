import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { Verification } from '../../domain/entities/verification';
import {
  ACTIVE_STATUSES,
  VerificationStatus,
  VerificationType,
} from '../../domain/entities/verification-types';
import {
  DecisionRecord,
  EvidenceRecord,
  ReviewRecord,
  VerificationRepository,
} from '../../domain/repositories/verification.repository';
import {
  VerificationRow,
  verificationDecisions,
  verificationEvidences,
  verificationReviews,
  verifications,
} from './verifications.schema';

@Injectable()
export class DrizzleVerificationRepository extends VerificationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(verification: Verification, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .insert(verifications)
      .values({
        id: verification.id,
        trustPassportId: verification.trustPassportId,
        identityId: verification.identityId,
        type: verification.type,
        status: verification.status,
        providerId: verification.providerId,
        currentAttempt: verification.currentAttempt,
        createdAt: verification.createdAt,
        updatedAt: verification.updatedAt,
        deletedAt: verification.deletedAt,
      })
      .onConflictDoUpdate({
        target: verifications.id,
        set: {
          status: verification.status,
          providerId: verification.providerId,
          updatedAt: verification.updatedAt,
          deletedAt: verification.deletedAt,
        },
      });
  }

  async findById(id: string): Promise<Verification | null> {
    const [row] = await this.db
      .select()
      .from(verifications)
      .where(and(eq(verifications.id, id), isNull(verifications.deletedAt)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async hasActiveByPassportAndType(
    trustPassportId: string,
    type: VerificationType,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: verifications.id })
      .from(verifications)
      .where(
        and(
          eq(verifications.trustPassportId, trustPassportId),
          eq(verifications.type, type),
          inArray(verifications.status, [...ACTIVE_STATUSES]),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async countByPassportAndType(
    trustPassportId: string,
    type: VerificationType,
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(verifications)
      .where(
        and(eq(verifications.trustPassportId, trustPassportId), eq(verifications.type, type)),
      );
    return row?.count ?? 0;
  }

  async listByPassportId(trustPassportId: string): Promise<Verification[]> {
    const rows = await this.db
      .select()
      .from(verifications)
      .where(eq(verifications.trustPassportId, trustPassportId))
      .orderBy(desc(verifications.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  async listByStatuses(
    statuses: readonly string[],
    page: number,
    pageSize: number,
  ): Promise<{ items: Verification[]; totalItems: number }> {
    const where = and(inArray(verifications.status, [...statuses]), isNull(verifications.deletedAt));
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(verifications)
        .where(where)
        .orderBy(verifications.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(verifications).where(where),
    ]);
    return { items: rows.map((row) => this.toEntity(row)), totalItems: total?.count ?? 0 };
  }

  async addEvidence(evidence: EvidenceRecord, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(verificationEvidences).values(evidence);
  }

  async listEvidences(verificationId: string): Promise<EvidenceRecord[]> {
    return this.db
      .select()
      .from(verificationEvidences)
      .where(eq(verificationEvidences.verificationId, verificationId))
      .orderBy(verificationEvidences.uploadedAt);
  }

  async addReview(review: ReviewRecord, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(verificationReviews).values(review);
  }

  async findActiveReview(verificationId: string): Promise<ReviewRecord | null> {
    const [row] = await this.db
      .select()
      .from(verificationReviews)
      .where(
        and(
          eq(verificationReviews.verificationId, verificationId),
          eq(verificationReviews.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return (row as ReviewRecord | undefined) ?? null;
  }

  async findLatestReview(verificationId: string): Promise<ReviewRecord | null> {
    const [row] = await this.db
      .select()
      .from(verificationReviews)
      .where(eq(verificationReviews.verificationId, verificationId))
      .orderBy(desc(verificationReviews.startedAt))
      .limit(1);
    return (row as ReviewRecord | undefined) ?? null;
  }

  async completeReview(
    reviewId: string,
    completedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(verificationReviews)
      .set({ status: 'COMPLETED', completedAt })
      .where(eq(verificationReviews.id, reviewId));
  }

  async addDecision(decision: DecisionRecord, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(verificationDecisions).values(decision);
  }

  async findDecision(verificationId: string): Promise<DecisionRecord | null> {
    const [row] = await this.db
      .select()
      .from(verificationDecisions)
      .where(eq(verificationDecisions.verificationId, verificationId))
      .limit(1);
    return (row as DecisionRecord | undefined) ?? null;
  }

  private toEntity(row: VerificationRow): Verification {
    return Verification.restore({
      id: row.id,
      trustPassportId: row.trustPassportId,
      identityId: row.identityId,
      type: row.type as VerificationType,
      status: row.status as VerificationStatus,
      providerId: row.providerId,
      currentAttempt: row.currentAttempt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }
}
