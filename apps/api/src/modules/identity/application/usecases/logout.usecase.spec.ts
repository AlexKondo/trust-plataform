import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { Session } from '../../domain/entities/session';
import {
  SessionAlreadyRevokedException,
  SessionNotFoundException,
} from '../../domain/exceptions/session.exceptions';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { LogoutUseCase } from './logout.usecase';

function makeSession(options: { revoked?: boolean } = {}): Session {
  const session = Session.createNew({
    identityId: 'identity-1',
    refreshTokenHash: 'a'.repeat(64),
    accessTokenId: 'access-token-id-1',
    ttlDays: 30,
  });
  if (options.revoked) {
    session.revoke();
  }
  return session;
}

function makeScenario(session: Session | null) {
  const sessionRepository = {
    findByAccessTokenId: vi.fn().mockResolvedValue(session),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionRepository;
  const outboxService = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }),
  } as unknown as OutboxService;
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn() } as unknown as PinoLogger;

  return {
    useCase: new LogoutUseCase(sessionRepository, outboxService, auditLogService, db, logger),
    sessionRepository,
    outboxService,
  };
}

describe('LogoutUseCase (IDN-006)', () => {
  it('revoga a sessão atual e publica Session.LoggedOut (BR-002/003)', async () => {
    const session = makeSession();
    const { useCase, sessionRepository, outboxService } = makeScenario(session);

    await useCase.execute('access-token-id-1');

    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(sessionRepository.save).toHaveBeenCalled();
    const call = vi.mocked(outboxService.enqueue).mock.calls[0]?.[1];
    expect(call).toMatchObject({ eventName: 'Session.LoggedOut' });
    expect(call?.payload).toMatchObject({ sessionId: session.id, identityId: 'identity-1' });
  });

  it('sessão inexistente → 404', async () => {
    const { useCase } = makeScenario(null);
    await expect(useCase.execute('unknown')).rejects.toBeInstanceOf(SessionNotFoundException);
  });

  it('sessão já revogada → 401 e não publica evento de novo', async () => {
    const { useCase, outboxService } = makeScenario(makeSession({ revoked: true }));
    await expect(useCase.execute('access-token-id-1')).rejects.toBeInstanceOf(
      SessionAlreadyRevokedException,
    );
    expect(outboxService.enqueue).not.toHaveBeenCalled();
  });
});
