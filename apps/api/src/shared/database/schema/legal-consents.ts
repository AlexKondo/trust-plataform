import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../modules/identity/infrastructure/persistence/identities.schema';

/**
 * IP-021 — consentimento/versão de documento legal (Termos de Uso, Política
 * de Privacidade). Vive no shared kernel, no mesmo nível de `audit_logs`: é
 * infraestrutura transversal (qualquer módulo pode precisar registrar um
 * aceite), não regra de negócio de um domínio específico — evita a
 * dependência circular que existiria se este contrato vivesse dentro do
 * módulo `privacy` (que por sua vez depende de `identity`).
 *
 * Um consentimento é um FATO — nunca é reescrito. `UNIQUE(identity_id,
 * document_type, document_version)` impede duplicar o aceite da MESMA
 * versão; aceitar uma versão nova do mesmo documento é sempre uma linha
 * nova (histórico completo de qual versão foi aceita quando).
 */
export const legalConsents = pgTable(
  'legal_consents',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** TERMS_OF_SERVICE | PRIVACY_POLICY */
    documentType: varchar('document_type', { length: 30 }).notNull(),
    documentVersion: varchar('document_version', { length: 20 }).notNull(),
    locale: varchar('locale', { length: 10 }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_legal_consent_unique').on(
      table.identityId,
      table.documentType,
      table.documentVersion,
    ),
    index('idx_legal_consent_identity').on(table.identityId, table.acceptedAt),
  ],
);

export type LegalConsentRow = typeof legalConsents.$inferSelect;
