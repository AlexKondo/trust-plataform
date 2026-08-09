import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { trustPassports } from '../../../trust-passport/infrastructure/persistence/trust-passports.schema';

/** Verificações (VRF-001). Índice parcial garante 1 ativa por Passport+tipo (BR-003). */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    type: varchar('type', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    providerId: uuid('provider_id'),
    currentAttempt: integer('current_attempt').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_verification_passport_type_status').on(table.trustPassportId, table.type, table.status),
    index('idx_verification_identity').on(table.identityId, table.createdAt),
    uniqueIndex('idx_verification_active_unique')
      .on(table.trustPassportId, table.type)
      .where(
        sql`${table.status} in ('WAITING_FOR_EVIDENCE', 'PENDING_REVIEW', 'IN_REVIEW')`,
      ),
  ],
);

/** Evidências (VRF-002). Imutáveis — exceção documentada: sem updated_at/soft delete. */
export const verificationEvidences = pgTable(
  'verification_evidences',
  {
    id: uuid('id').primaryKey(),
    verificationId: uuid('verification_id')
      .notNull()
      .references(() => verifications.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    type: varchar('type', { length: 40 }).notNull(),
    storageKey: varchar('storage_key', { length: 300 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_verification_evidence_verification').on(table.verificationId),
    index('idx_verification_evidence_type').on(table.verificationId, table.type),
  ],
);

/** Revisões (VRF-003). BR-004: 1 revisão ativa por verificação (índice parcial). */
export const verificationReviews = pgTable(
  'verification_reviews',
  {
    id: uuid('id').primaryKey(),
    verificationId: uuid('verification_id')
      .notNull()
      .references(() => verifications.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    reviewType: varchar('review_type', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    reviewerIdentityId: uuid('reviewer_identity_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_verification_review_verification').on(table.verificationId),
    uniqueIndex('idx_verification_review_active')
      .on(table.verificationId)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

/** Decisões (VRF-004/005). Irreversíveis — 1 por verificação (UNIQUE), append-only. */
export const verificationDecisions = pgTable(
  'verification_decisions',
  {
    id: uuid('id').primaryKey(),
    verificationId: uuid('verification_id')
      .notNull()
      .references(() => verifications.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => verificationReviews.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    decision: varchar('decision', { length: 20 }).notNull(),
    decisionSource: varchar('decision_source', { length: 30 }).notNull(),
    reasonCode: varchar('reason_code', { length: 50 }),
    comments: text('comments'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [uniqueIndex('idx_verification_decision_unique').on(table.verificationId)],
);

export type VerificationRow = typeof verifications.$inferSelect;
export type VerificationEvidenceRow = typeof verificationEvidences.$inferSelect;
export type VerificationReviewRow = typeof verificationReviews.$inferSelect;
export type VerificationDecisionRow = typeof verificationDecisions.$inferSelect;
