import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../database/database.module';
import { riskFlags } from '../database/schema';
import { AuditLogService } from '../audit/audit-log.service';
import {
  RiskFlagAlreadyReviewedException,
  RiskFlagNotFoundException,
} from './safety.exceptions';

export type RiskFlagSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskFlagStatus = 'OPEN' | 'DISMISSED' | 'CONFIRMED';

export interface RaiseRiskFlagInput {
  entityType: string;
  entityId: string;
  subjectIdentityId?: string;
  /** Código estável da regra determinística — nunca um score de ML opaco. */
  signal: string;
  reason: string;
  severity?: RiskFlagSeverity;
  metadata?: Record<string, unknown>;
}

export interface RiskFlagResponse {
  id: string;
  entityType: string;
  entityId: string;
  subjectIdentityId: string | null;
  signal: string;
  reason: string;
  severity: string;
  status: string;
  metadata: Record<string, unknown> | null;
  raisedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/**
 * IP-014 — mecanismo genérico de risk-flag para a fila de revisão do admin
 * (§6: "admin risk flags", "flags are explainable", "manual review path
 * exists"). Deliberadamente burro: nenhuma regra vive aqui, só o registro e
 * o ciclo de vida (OPEN → CONFIRMED|DISMISSED por um admin humano). As
 * regras que decidem QUANDO levantar um flag vivem no use case do domínio
 * que detecta o padrão (ex.: Change Order suspeito) — isso mantém a
 * explicação (`reason`) perto do contexto que a produziu.
 */
@Injectable()
export class RiskFlagService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLogService: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RiskFlagService.name);
  }

  /** Sempre auditado — levantar um flag é, em si, um evento de investigação. */
  async raise(input: RaiseRiskFlagInput, executor?: DatabaseExecutor): Promise<string> {
    const target = executor ?? this.db;
    const id = uuidv7();
    const raisedAt = new Date();
    await target.insert(riskFlags).values({
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      subjectIdentityId: input.subjectIdentityId,
      signal: input.signal,
      reason: input.reason,
      severity: input.severity ?? 'MEDIUM',
      status: 'OPEN',
      metadata: input.metadata,
      raisedAt,
    });
    await this.auditLogService.record(
      {
        identityId: input.subjectIdentityId,
        operation: 'RaiseRiskFlag',
        resource: input.entityType,
        resourceId: input.entityId,
        result: 'DENIED',
        metadata: { riskFlagId: id, signal: input.signal, reason: input.reason },
      },
      executor,
    );
    this.logger.warn(
      { operation: 'RaiseRiskFlag', riskFlagId: id, entityType: input.entityType, entityId: input.entityId, signal: input.signal },
      'Risk flag raised for manual review.',
    );
    return id;
  }

  /** Fila do admin — nunca inclui flags já revisados por padrão. */
  async listQueue(status: RiskFlagStatus = 'OPEN'): Promise<RiskFlagResponse[]> {
    const rows = await this.db
      .select()
      .from(riskFlags)
      .where(eq(riskFlags.status, status))
      .orderBy(desc(riskFlags.raisedAt))
      .limit(100);
    return rows.map(toResponse);
  }

  /** Decisão humana obrigatória — nunca um fechamento automático (§4 out-of-scope). */
  async review(
    riskFlagId: string,
    reviewerIdentityId: string,
    decision: 'CONFIRMED' | 'DISMISSED',
    note: string | undefined,
    meta: { ipAddress?: string; userAgent?: string; correlationId?: string; requestId?: string },
  ): Promise<RiskFlagResponse> {
    const [existing] = await this.db.select().from(riskFlags).where(eq(riskFlags.id, riskFlagId));
    if (!existing) {
      throw new RiskFlagNotFoundException();
    }
    if (existing.status !== 'OPEN') {
      throw new RiskFlagAlreadyReviewedException();
    }

    const reviewedAt = new Date();
    const [updated] = await this.db
      .update(riskFlags)
      .set({ status: decision, reviewedBy: reviewerIdentityId, reviewedAt, reviewNote: note })
      .where(and(eq(riskFlags.id, riskFlagId), eq(riskFlags.status, 'OPEN')))
      .returning();
    if (!updated) {
      throw new RiskFlagAlreadyReviewedException();
    }

    await this.auditLogService.record({
      identityId: reviewerIdentityId,
      operation: 'ReviewRiskFlag',
      resource: existing.entityType,
      resourceId: existing.entityId,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      metadata: { riskFlagId, decision, note },
    });

    return toResponse(updated);
  }
}

function toResponse(row: typeof riskFlags.$inferSelect): RiskFlagResponse {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    subjectIdentityId: row.subjectIdentityId,
    signal: row.signal,
    reason: row.reason,
    severity: row.severity,
    status: row.status,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    raisedAt: row.raisedAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNote: row.reviewNote,
  };
}
