import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { EmailVerificationToken } from '../../domain/entities/email-verification-token';
import { Identity } from '../../domain/entities/identity';
import { IDENTITY_STATUS } from '../../domain/entities/identity-status';
import {
  EmailAlreadyVerifiedException,
  ExpiredVerificationTokenException,
  InvalidVerificationTokenException,
} from '../../domain/exceptions/verification.exceptions';
import { EmailVerificationTokenRepository } from '../../domain/repositories/email-verification-token.repository';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { CryptoTokenGeneratorService } from '../../infrastructure/security/crypto-token-generator.service';
import { VerifyEmailUseCase } from './verify-email.usecase';

const tokenGenerator = new CryptoTokenGeneratorService();

function makeIdentity(): Identity {
  return Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: '$argon2id$fake',
  });
}

function makeScenario(options: { ttlHours?: number; identity?: Identity | null } = {}) {
  const identity = options.identity === undefined ? makeIdentity() : options.identity;
  const raw = tokenGenerator.generate();
  const token = EmailVerificationToken.createNew({
    identityId: identity?.id ?? 'missing',
    tokenHash: raw.tokenHash,
    ttlHours: options.ttlHours ?? 24,
  });

  const tokenRepository = {
    findByTokenHash: vi.fn((hash: string) =>
      Promise.resolve(hash === token.tokenHash ? token : null),
    ),
    markAsVerified: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(),
    invalidatePendingByIdentity: vi.fn(),
    deleteExpired: vi.fn(),
  } as unknown as EmailVerificationTokenRepository;

  const identityRepository = {
    findById: vi.fn().mockResolvedValue(identity),
    save: vi.fn().mockResolvedValue(undefined),
    findByEmail: vi.fn(),
    existsByEmail: vi.fn(),
  } as unknown as IdentityRepository;

  const outboxService = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }),
  } as unknown as OutboxService;
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

  const useCase = new VerifyEmailUseCase(
    identityRepository,
    tokenRepository,
    tokenGenerator,
    outboxService,
    auditLogService,
    db,
    logger,
  );

  return { useCase, identity, token, rawToken: raw.token, outboxService, identityRepository };
}

describe('VerifyEmailUseCase (IDN-002)', () => {
  it('ativa a Identity (BR-005) e invalida o token (BR-003)', async () => {
    const { useCase, identity, rawToken, token } = makeScenario();
    const response = await useCase.execute(rawToken);

    expect(response.status).toBe(IDENTITY_STATUS.ACTIVE);
    expect(identity?.isActive).toBe(true);
    expect(token.verifiedAt).toBeInstanceOf(Date);
  });

  it('publica Identity.Created e Identity.EmailVerified encadeados via outbox', async () => {
    const { useCase, identity, rawToken, outboxService } = makeScenario();
    await useCase.execute(rawToken, { correlationId: '018f0000-0000-7000-8000-00000000000a' });

    const calls = vi.mocked(outboxService.enqueue).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toMatchObject({
      eventName: 'Identity.Created',
      producer: 'identity-service',
      payload: { identityId: identity?.id },
    });
    expect(calls[1]?.[1]).toMatchObject({
      eventName: 'Identity.EmailVerified',
      causationId: 'evt-1',
    });
  });

  it('rejeita token desconhecido com 400 (BR-006)', async () => {
    const { useCase } = makeScenario();
    await expect(useCase.execute('token-que-nao-existe-nunca')).rejects.toBeInstanceOf(
      InvalidVerificationTokenException,
    );
  });

  it('rejeita token expirado (BR-002/006)', async () => {
    const { useCase, rawToken } = makeScenario({ ttlHours: -1 });
    await expect(useCase.execute(rawToken)).rejects.toBeInstanceOf(
      ExpiredVerificationTokenException,
    );
  });

  it('rejeita reuso de token já verificado (BR-004) com 409', async () => {
    const { useCase, rawToken, token } = makeScenario();
    token.markVerified();
    await expect(useCase.execute(rawToken)).rejects.toBeInstanceOf(EmailAlreadyVerifiedException);
  });

  it('não publica eventos quando o token é inválido', async () => {
    const { useCase, outboxService } = makeScenario();
    await useCase.execute('token-invalido-com-vinte-chars').catch(() => undefined);
    expect(outboxService.enqueue).not.toHaveBeenCalled();
  });
});
