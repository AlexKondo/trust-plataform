import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassport } from '../../domain/entities/trust-passport';
import {
  TrustPassportAlreadyExistsException,
  TrustPassportNotFoundException,
} from '../../domain/exceptions/trust-passport.exceptions';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';
import { IdentityCreatedConsumer } from '../../infrastructure/consumers/identity-created.consumer';
import { CreateTrustPassportUseCase } from './create-trust-passport.usecase';
import { GetTrustPassportUseCase } from './get-trust-passport.usecase';
import { UpdateTrustPassportUseCase } from './update-trust-passport.usecase';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;
const dbMock = () =>
  ({
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  }) as unknown as Database;
const auditMock = () =>
  ({ record: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditLogService;
const outboxMock = () =>
  ({ enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }) }) as unknown as OutboxService;

function repoMock(existing: TrustPassport | null = null) {
  return {
    findByIdentityId: vi.fn().mockResolvedValue(existing),
    existsByIdentityId: vi.fn().mockResolvedValue(Boolean(existing)),
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as TrustPassportRepository;
}

describe('CreateTrustPassportUseCase (TPS-001)', () => {
  it('cria o Passport, publica TrustPassport.Created e audita', async () => {
    const repository = repoMock();
    const outbox = outboxMock();
    const useCase = new CreateTrustPassportUseCase(repository, outbox, auditMock(), dbMock(), logger());

    const result = await useCase.execute('identity-1', { correlationId: 'corr-1' });

    expect(result.created).toBe(true);
    expect(result.status).toBe('ACTIVE');
    expect(repository.save).toHaveBeenCalled();
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({
      eventType: 'TrustPassport.Created',
      producer: 'trust-passport-service',
      correlationId: 'corr-1',
    });
    expect((event?.payload as { identityId: string }).identityId).toBe('identity-1');
  });

  it('duplicado via API → 409; via consumer (idempotent) → no-op com o id existente', async () => {
    const existing = TrustPassport.createNew('identity-1');
    const repository = repoMock(existing);
    const outbox = outboxMock();
    const useCase = new CreateTrustPassportUseCase(repository, outbox, auditMock(), dbMock(), logger());

    await expect(useCase.execute('identity-1')).rejects.toBeInstanceOf(
      TrustPassportAlreadyExistsException,
    );

    const result = await useCase.execute('identity-1', { idempotent: true });
    expect(result.created).toBe(false);
    expect(result.trustPassportId).toBe(existing.id);
    expect(repository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});

describe('IdentityCreatedConsumer', () => {
  it('repassa identityId, correlationId e causationId ao use case em modo idempotente', async () => {
    const createUseCase = {
      execute: vi.fn().mockResolvedValue({ trustPassportId: 'tp-1', status: 'ACTIVE', created: true }),
    } as unknown as CreateTrustPassportUseCase;
    const consumer = new IdentityCreatedConsumer(createUseCase);
    const tx = Symbol('tx') as never;
    const envelope: EventEnvelope = {
      eventId: 'evt-9',
      eventType: 'Identity.Created',
      aggregateType: 'Identity',
      aggregateId: 'identity-9',
      eventVersion: '1.0',
      occurredAt: new Date().toISOString(),
      producer: 'identity-service',
      correlationId: 'corr-9',
      payload: { identityId: 'identity-9' },
    };

    await consumer.handle(envelope, tx);

    expect(createUseCase.execute).toHaveBeenCalledWith(
      'identity-9',
      { correlationId: 'corr-9', causationId: 'evt-9', idempotent: true },
      tx,
    );
  });
});

describe('Get/UpdateTrustPassportUseCase (TPS-002/003)', () => {
  it('get retorna DTO completo; 404 sem passport', async () => {
    const passport = TrustPassport.createNew('identity-1');
    const useCase = new GetTrustPassportUseCase(repoMock(passport), logger());
    const response = await useCase.execute('identity-1');
    expect(response).toMatchObject({
      trustPassportId: passport.id,
      status: 'ACTIVE',
      profileCompletion: 25,
      emailVerified: true,
      address: null,
    });

    const missing = new GetTrustPassportUseCase(repoMock(null), logger());
    await expect(missing.execute('x')).rejects.toBeInstanceOf(TrustPassportNotFoundException);
  });

  it('update persiste, publica TrustPassport.Updated com updatedFields e audita', async () => {
    const passport = TrustPassport.createNew('identity-1');
    const repository = repoMock(passport);
    const outbox = outboxMock();
    const audit = auditMock();
    const useCase = new UpdateTrustPassportUseCase(repository, outbox, audit, dbMock(), logger());

    const response = await useCase.execute('identity-1', {
      phone: '+55 11 99999-9999',
    });

    expect(repository.save).toHaveBeenCalled();
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({ eventType: 'TrustPassport.Updated' });
    expect((event?.payload as { updatedFields: string[] }).updatedFields).toEqual(['phone']);
    expect(response.trustPassportId).toBe(passport.id);
  });

  it('update sem mudanças reais não persiste nem publica evento', async () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.updateProfile({ phone: '+55 11 99999-9999' });
    const repository = repoMock(passport);
    const outbox = outboxMock();
    const useCase = new UpdateTrustPassportUseCase(repository, outbox, auditMock(), dbMock(), logger());

    await useCase.execute('identity-1', { phone: '+55 11 99999-9999' });

    expect(repository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
