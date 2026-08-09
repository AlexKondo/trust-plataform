import {
  boolean,
  decimal,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';

/**
 * Trust Passport (TPS-001; colunas canônicas do INCONSISTENCIAS #6).
 * 1:1 com identities (UNIQUE identity_id). Campos de perfil (phone/address)
 * suportam o TPS-003; verificação deles é projetada pelo VRF (TPS-004 futuro).
 */
export const trustPassports = pgTable(
  'trust_passports',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    status: varchar('status', { length: 30 }).notNull(),
    profileCompletion: decimal('profile_completion', { precision: 5, scale: 2 }).notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    documentVerified: boolean('document_verified').notNull().default(false),
    addressVerified: boolean('address_verified').notNull().default(false),
    phone: varchar('phone', { length: 30 }),
    addressCountry: varchar('address_country', { length: 2 }),
    addressState: varchar('address_state', { length: 60 }),
    addressCity: varchar('address_city', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('idx_trust_passport_identity').on(table.identityId),
    index('idx_trust_passport_status').on(table.status),
  ],
);

export type TrustPassportRow = typeof trustPassports.$inferSelect;
