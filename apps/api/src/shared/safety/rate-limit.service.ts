import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../database/database.module';
import { auditLogs } from '../database/schema';
import { SensitiveActionRateLimitExceededException } from './safety.exceptions';

export interface RateLimitOptions {
  /** Máximo de tentativas dentro da janela, incluindo a que está prestes a ocorrer. */
  maxAttempts: number;
  windowMinutes: number;
}

/**
 * IP-014 — guarda de rate limit canônico para operações sensíveis
 * (§6 acceptance: "rate limits canonical").
 *
 * Por que reaproveitar `audit_logs` em vez de criar uma tabela de contadores
 * nova: a trilha de auditoria já registra toda tentativa (SUCCESS/DENIED) de
 * cada operação sensível com `identityId` + `operation` + `occurredAt`
 * (trust-logging), então contar por essa mesma fonte evita duplicar estado —
 * um único fato ("esta identity tentou X, Y vezes, na janela Z") sustenta
 * tanto a trilha de investigação quanto o limite. Isso também garante que o
 * limite sobrevive a reinícios do processo (ao contrário de um contador em
 * memória) sem infraestrutura nova.
 *
 * Este guard NUNCA bloqueia sem explicação: a exceção lançada tem código e
 * é sempre auditável (o caller grava o `DENIED` correspondente, como já faz
 * hoje em `AuthenticateIdentityUseCase`).
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lança `SensitiveActionRateLimitExceededException` se o limite já foi atingido. */
  async assertWithinLimit(
    identityId: string,
    operation: string,
    options: RateLimitOptions,
  ): Promise<void> {
    const attempts = await this.countRecent(identityId, operation, options.windowMinutes);
    if (attempts >= options.maxAttempts) {
      throw new SensitiveActionRateLimitExceededException();
    }
  }

  private async countRecent(
    identityId: string,
    operation: string,
    windowMinutes: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.identityId, identityId),
          eq(auditLogs.operation, operation),
          gte(auditLogs.occurredAt, since),
        ),
      );
    return row?.count ?? 0;
  }
}
