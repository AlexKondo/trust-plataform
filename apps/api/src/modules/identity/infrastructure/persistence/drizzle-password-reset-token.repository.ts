import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { PasswordResetTokenRow, passwordResetTokens } from './password-reset-tokens.schema';

@Injectable()
export class DrizzlePasswordResetTokenRepository extends PasswordResetTokenRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(token: PasswordResetToken, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(passwordResetTokens).values({
      id: token.id,
      identityId: token.identityId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
      invalidatedAt: token.invalidatedAt,
      createdAt: token.createdAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async markAsUsed(id: string, usedAt: Date, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(passwordResetTokens)
      .set({ usedAt })
      .where(eq(passwordResetTokens.id, id));
  }

  async invalidateActiveByIdentity(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(passwordResetTokens)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.identityId, identityId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.invalidatedAt),
        ),
      );
  }

  async deleteExpired(olderThan: Date): Promise<number> {
    const deleted = await this.db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, olderThan))
      .returning({ id: passwordResetTokens.id });
    return deleted.length;
  }

  private toEntity(row: PasswordResetTokenRow): PasswordResetToken {
    return PasswordResetToken.restore({
      id: row.id,
      identityId: row.identityId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      invalidatedAt: row.invalidatedAt,
      createdAt: row.createdAt,
    });
  }
}
