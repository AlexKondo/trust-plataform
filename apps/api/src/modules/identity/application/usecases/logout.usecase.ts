import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  SessionAlreadyRevokedException,
  SessionNotFoundException,
} from '../../domain/exceptions/session.exceptions';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

/**
 * IDN-006 — Logout. Revoga APENAS a sessão atual (BR-006), identificada pelo
 * jti do access token. O refresh token morre junto (a sessão revogada rejeita
 * refresh — BR-004). O access token segue válido por até 15 min (P7: sem
 * blocklist no MVP) — decisão de arquitetura documentada.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogoutUseCase.name);
  }

  async execute(accessTokenId: string, metadata: RequestMetadata = {}): Promise<void> {
    const session = await this.sessionRepository.findByAccessTokenId(accessTokenId);
    if (!session) {
      throw new SessionNotFoundException();
    }
    if (session.revokedAt) {
      throw new SessionAlreadyRevokedException();
    }

    const loggedOutAt = new Date();
    session.revoke(loggedOutAt);

    await this.db.transaction(async (tx) => {
      await this.sessionRepository.save(session, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'Session.LoggedOut',
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? session.id,
        payload: {
          sessionId: session.id,
          identityId: session.identityId,
          loggedOutAt: loggedOutAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: session.identityId,
          operation: 'Logout',
          resource: 'Session',
          resourceId: session.id,
          result: 'SUCCESS',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          correlationId: metadata.correlationId,
          requestId: metadata.requestId,
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'Logout',
        identityId: session.identityId,
        sessionId: session.id,
        correlationId: metadata.correlationId,
        result: 'SUCCESS',
      },
      'Session logged out.',
    );
  }
}
