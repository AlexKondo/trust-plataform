import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Session } from '../entities/session';

export abstract class SessionRepository {
  abstract save(session: Session, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<Session | null>;
  abstract findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null>;
  /** Sessão dona do access token atual (jti) — usado no logout (IDN-006). */
  abstract findByAccessTokenId(accessTokenId: string): Promise<Session | null>;
  abstract findActiveByIdentity(identityId: string): Promise<Session[]>;
  /** IDN-008 BR-006: reset de senha revoga TODAS as sessões da Identity. */
  abstract revokeAllByIdentity(identityId: string, executor?: DatabaseExecutor): Promise<void>;
  /** IDN-009 BR-007: change password revoga todas EXCETO a sessão atual. */
  abstract revokeAllByIdentityExcept(
    identityId: string,
    exceptSessionId: string,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract deleteExpired(olderThan: Date): Promise<number>;
}
