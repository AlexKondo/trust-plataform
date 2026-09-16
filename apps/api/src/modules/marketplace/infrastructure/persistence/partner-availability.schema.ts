import { index, pgTable, smallint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';

/**
 * IP-005 — janela de disponibilidade semanal declarada pelo Trust Partner
 * (ver `partner-availability.ts`). Mutável por design: representa uma
 * PREFERÊNCIA corrente, não um fato histórico imutável — trocar de janelas
 * substitui o conjunto inteiro (`replaceForPartner`), não acumula histórico.
 */
export const marketplacePartnerAvailabilityWindows = pgTable(
  'marketplace_partner_availability_windows',
  {
    id: uuid('id').primaryKey(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** 0 = domingo ... 6 = sábado (Intl.DateTimeFormat/Date#getDay()). */
    dayOfWeek: smallint('day_of_week').notNull(),
    startMinute: smallint('start_minute').notNull(),
    endMinute: smallint('end_minute').notNull(),
    timezone: varchar('timezone', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_partner_availability_partner').on(table.partnerId, table.dayOfWeek),
  ],
);

export type PartnerAvailabilityWindowRow = typeof marketplacePartnerAvailabilityWindows.$inferSelect;
