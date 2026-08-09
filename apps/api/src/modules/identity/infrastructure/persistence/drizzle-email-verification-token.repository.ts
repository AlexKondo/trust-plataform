import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { EmailVerificationToken } from '../../domain/entities/email-verification-token';
import { EmailVerificationTokenRepository } from '../../domain/repositories/email-verification-token.repository';
import {
  EmailVerificationTokenRow,
  emailVerificationTokens,
} from './email-verification-tokens.schema';

@Injectable()
export class DrizzleEmailVerificationTokenRepository extends EmailVerificationTokenRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(token: EmailVerificationToken, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(emailVerificationTokens).values({
      id: token.id,
      identityId: token.identityId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      verifiedAt: token.verifiedAt,
      invalidatedAt: token.invalidatedAt,
      createdAt: token.createdAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const [row] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async markAsVerified(id: string, verifiedAt: Date, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(emailVerificationTokens)
      .set({ verifiedAt })
      .where(eq(emailVerificationTokens.id, id));
  }

  async invalidatePendingByIdentity(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(emailVerificationTokens)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.identityId, identityId),
          isNull(emailVerificationTokens.verifiedAt),
          isNull(emailVerificationTokens.invalidatedAt),
        ),
      );
  }

  async deleteExpired(olderThan: Date): Promise<number> {
    const deleted = await this.db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, olderThan))
      .returning({ id: emailVerificationTokens.id });
    return deleted.length;
  }

  private toEntity(row: EmailVerificationTokenRow): EmailVerificationToken {
    return EmailVerificationToken.restore({
      id: row.id,
      identityId: row.identityId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      verifiedAt: row.verifiedAt,
      invalidatedAt: row.invalidatedAt,
      createdAt: row.createdAt,
    });
  }
}
