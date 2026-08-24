import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassport, attributeForVerificationType } from '../../domain/entities/trust-passport';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';
import {
  VerificationApprovedConsumer,
  VerificationRejectedConsumer,
} from './verification-decided.consumers';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function envelope(eventType: string, payload: Record<string, unknown>): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType,
    aggregateType: 'Verification',
    aggregateId: 'vrf-1',
    eventVersion: '1.0',
    occurredAt: new Date().toISOString(),
    producer: 'verification-service',
    correlationId: 'corr-1',
    payload,
  };
}

function makeScenario(passport: TrustPassport | null) {
  const repository = {
    findById: vi.fn().mockResolvedValue(passport),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as TrustPassportRepository;
  const outbox = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-2' }),
  } as unknown as OutboxService;
  const tx = Symbol('tx') as never;
  return { repository, outbox, tx };
}

describe('attributeForVerificationType (TPS-004 BR-002)', () => {
  it('mapeia tipos com atributo consolidado e ignora os demais (BR-004)', () => {
    expect(attributeForVerificationType('DOCUMENT')).toBe('document');
    expect(attributeForVerificationType('ADDRESS')).toBe('address');
    expect(attributeForVerificationType('PHONE')).toBe('phone');
    expect(attributeForVerificationType('EMAIL')).toBe('email');
    expect(attributeForVerificationType('BANK_ACCOUNT')).toBeNull();
    expect(attributeForVerificationType('BUSINESS')).toBeNull();
    expect(attributeForVerificationType('BIOMETRIC')).toBeNull();
  });
});

describe('VerificationApprovedConsumer (TPS-004)', () => {
  it('marca o atributo, recalcula completude e publica TrustPassport.Updated', async () => {
    const passport = TrustPassport.createNew('identity-1'); // email=25%
    const { repository, outbox, tx } = makeScenario(passport);
    const consumer = new VerificationApprovedConsumer(repository, outbox, logger());

    await consumer.handle(
      envelope('Verification.Approved', { trustPassportId: passport.id, type: 'DOCUMENT' }),
      tx,
    );

    expect(passport.documentVerified).toBe(true);
    expect(passport.profileCompletion).toBe(50);
    expect(repository.save).toHaveBeenCalledWith(passport, tx);
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({ eventType: 'TrustPassport.Updated', causationId: 'evt-1' });
    expect(event?.payload).toMatchObject({
      updatedFields: ['documentVerified'],
      profileCompletion: 50,
    });
  });

  it('é idempotente: atributo já verificado → nada persiste, nada publica (BR-006)', async () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.markVerified('document');
    const { repository, outbox, tx } = makeScenario(passport);
    const consumer = new VerificationApprovedConsumer(repository, outbox, logger());

    await consumer.handle(
      envelope('Verification.Approved', { trustPassportId: passport.id, type: 'DOCUMENT' }),
      tx,
    );

    expect(repository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('passport inexistente → lança (pg-boss reagenda)', async () => {
    const { repository, outbox, tx } = makeScenario(null);
    const consumer = new VerificationApprovedConsumer(repository, outbox, logger());
    await expect(
      consumer.handle(
        envelope('Verification.Approved', { trustPassportId: 'missing', type: 'DOCUMENT' }),
        tx,
      ),
    ).rejects.toThrow();
  });

  it('tipo sem atributo consolidado → no-op (BR-004)', async () => {
    const passport = TrustPassport.createNew('identity-1');
    const { repository, outbox, tx } = makeScenario(passport);
    const consumer = new VerificationApprovedConsumer(repository, outbox, logger());

    await consumer.handle(
      envelope('Verification.Approved', { trustPassportId: passport.id, type: 'BUSINESS' }),
      tx,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('VerificationRejectedConsumer (INCONSISTENCIAS #7)', () => {
  it('reverte atributo verificado e recalcula (BR-003)', async () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.markVerified('address');
    expect(passport.profileCompletion).toBe(50);
    const { repository, outbox, tx } = makeScenario(passport);
    const consumer = new VerificationRejectedConsumer(repository, outbox, logger());

    await consumer.handle(
      envelope('Verification.Rejected', { trustPassportId: passport.id, type: 'ADDRESS' }),
      tx,
    );

    expect(passport.addressVerified).toBe(false);
    expect(passport.profileCompletion).toBe(25);
    expect(repository.save).toHaveBeenCalled();
  });

  it('rejeição de atributo já não-verificado → no-op', async () => {
    const passport = TrustPassport.createNew('identity-1');
    const { repository, outbox, tx } = makeScenario(passport);
    const consumer = new VerificationRejectedConsumer(repository, outbox, logger());

    await consumer.handle(
      envelope('Verification.Rejected', { trustPassportId: passport.id, type: 'ADDRESS' }),
      tx,
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
