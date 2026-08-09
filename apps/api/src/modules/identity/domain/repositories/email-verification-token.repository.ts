import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EmailVerificationToken } from '../entities/email-verification-token';

export abstract class EmailVerificationTokenRepository {
  abstract save(token: EmailVerificationToken, executor?: DatabaseExecutor): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  abstract markAsVerified(id: string, verifiedAt: Date, executor?: DatabaseExecutor): Promise<void>;
  /** Invalida tokens pendentes da Identity (reenvio gera token novo — só o último vale). */
  abstract invalidatePendingByIdentity(
    identityId: string,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract deleteExpired(olderThan: Date): Promise<number>;
}
