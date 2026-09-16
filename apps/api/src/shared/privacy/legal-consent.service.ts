import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../database/database.module';
import { legalConsents } from '../database/schema/legal-consents';
import { LegalDocumentType } from './legal-documents';

export interface LegalConsentSummary {
  documentType: LegalDocumentType;
  documentVersion: string;
  locale: string;
  acceptedAt: Date;
}

/**
 * IP-021 — captura de consentimento/versão de documento legal. Shared kernel
 * (como `AuditLogService`): qualquer módulo pode registrar um aceite sem
 * criar uma dependência circular com o módulo `privacy` (que por sua vez
 * depende de `identity`).
 */
@Injectable()
export class LegalConsentService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Idempotente na mesma versão: `onConflictDoNothing` no par único evita
   * duplicar a linha se o mesmo aceite chegar duas vezes (ex.: reenvio de
   * formulário) — aceitar a MESMA versão de novo não é um novo fato.
   */
  async recordAcceptance(
    identityId: string,
    documentType: LegalDocumentType,
    documentVersion: string,
    locale: string,
    executor?: DatabaseExecutor,
    now: Date = new Date(),
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .insert(legalConsents)
      .values({
        id: uuidv7(),
        identityId,
        documentType,
        documentVersion,
        locale,
        acceptedAt: now,
      })
      .onConflictDoNothing({ target: [legalConsents.identityId, legalConsents.documentType, legalConsents.documentVersion] });
  }

  async listForIdentity(identityId: string): Promise<LegalConsentSummary[]> {
    const rows = await this.db
      .select()
      .from(legalConsents)
      .where(eq(legalConsents.identityId, identityId));
    return rows.map((row) => ({
      documentType: row.documentType as LegalDocumentType,
      documentVersion: row.documentVersion,
      locale: row.locale,
      acceptedAt: row.acceptedAt,
    }));
  }
}
