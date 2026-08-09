import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { PasswordResetToken } from '../entities/password-reset-token';

export abstract class PasswordResetTokenRepository {
  abstract save(token: PasswordResetToken, executor?: DatabaseExecutor): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  abstract markAsUsed(id: string, usedAt: Date, executor?: DatabaseExecutor): Promise<void>;
  /** BR-005 do IDN-007: só um token ativo por Identity — invalida os anteriores. */
  abstract invalidateActiveByIdentity(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract deleteExpired(olderThan: Date): Promise<number>;
}
