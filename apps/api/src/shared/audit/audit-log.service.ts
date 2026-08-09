import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../database/database.module';
import { auditLogs } from '../database/schema';

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditLogEntry {
  /** Identity que executou a operação (null para anônimo, ex.: tentativa de login). */
  identityId?: string;
  /** Nome da operação em PascalCase — ex.: `AuthenticateIdentity`, `ApproveVerification`. */
  operation: string;
  /** Tipo do recurso afetado — ex.: `Identity`, `Verification`. */
  resource: string;
  resourceId?: string;
  result: AuditResult;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  requestId?: string;
  /** Contexto adicional NÃO sensível — nunca senhas, tokens, hashes ou PII desnecessária. */
  metadata?: Record<string, unknown>;
}

/**
 * Trilha de auditoria imutável (DOC-002/006). Operações que DEVEM auditar:
 * login/logout, criação de Identity, verificação de e-mail, alteração/recuperação
 * de senha, mudanças cadastrais e de permissão, revogação de sessões, operações
 * administrativas, exclusões lógicas, aprovações críticas e acessos a Trust
 * Profile de terceiros (lista completa na skill trust-security).
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditLogService.name);
  }

  /**
   * Grava dentro da transação do chamador quando `executor` é passado — a
   * auditoria de uma operação de negócio deve ser atômica com ela.
   */
  async record(entry: AuditLogEntry, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(auditLogs).values({
      id: uuidv7(),
      identityId: entry.identityId,
      operation: entry.operation,
      resource: entry.resource,
      resourceId: entry.resourceId,
      result: entry.result,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      correlationId: entry.correlationId,
      requestId: entry.requestId,
      metadata: entry.metadata,
      occurredAt: new Date(),
    });
  }

  /**
   * Variante que nunca propaga erro — para auditoria de operações de leitura
   * onde falha de auditoria não deve derrubar a requisição. Operações de
   * escrita críticas devem usar `record` dentro da transação.
   */
  async recordSafe(entry: AuditLogEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (error) {
      this.logger.error(
        { err: error, operation: entry.operation, correlationId: entry.correlationId },
        'Failed to persist audit log entry.',
      );
    }
  }
}
