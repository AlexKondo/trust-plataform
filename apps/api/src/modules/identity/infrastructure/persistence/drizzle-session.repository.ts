import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { Session } from '../../domain/entities/session';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { SessionRow, sessions } from './sessions.schema';

@Injectable()
export class DrizzleSessionRepository extends SessionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(session: Session, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .insert(sessions)
      .values({
        id: session.id,
        identityId: session.identityId,
        refreshTokenHash: session.refreshTokenHash,
        accessTokenId: session.accessTokenId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastAccessAt: session.lastAccessAt,
        revokedAt: session.revokedAt,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          refreshTokenHash: session.refreshTokenHash,
          accessTokenId: session.accessTokenId,
          lastAccessAt: session.lastAccessAt,
          revokedAt: session.revokedAt,
        },
      });
  }

  async findById(id: string): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByAccessTokenId(accessTokenId: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.accessTokenId, accessTokenId))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findActiveByIdentity(identityId: string): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.identityId, identityId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async deleteExpired(olderThan: Date): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, olderThan))
      .returning({ id: sessions.id });
    return deleted.length;
  }

  private toEntity(row: SessionRow): Session {
    return Session.restore({
      id: row.id,
      identityId: row.identityId,
      refreshTokenHash: row.refreshTokenHash,
      accessTokenId: row.accessTokenId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastAccessAt: row.lastAccessAt,
      revokedAt: row.revokedAt,
    });
  }
}
