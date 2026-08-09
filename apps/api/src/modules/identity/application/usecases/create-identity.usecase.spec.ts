import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { IDENTITY_STATUS } from '../../domain/entities/identity-status';
import { EmailAlreadyExistsException } from '../../domain/exceptions/email-already-exists.exception';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CreateIdentityRequest } from '../dto/create-identity.request';
import { CreateIdentityUseCase } from './create-identity.usecase';

const request: CreateIdentityRequest = {
  fullName: 'John Doe',
  email: 'john@example.com',
  password: 'Correct#Horse7Battery',
  confirmPassword: 'Correct#Horse7Battery',
  acceptTerms: true,
};

function makeUseCase(overrides: { emailExists?: boolean } = {}) {
  const repository = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    existsByEmail: vi.fn().mockResolvedValue(overrides.emailExists ?? false),
  } as unknown as IdentityRepository;

  const passwordHashService = {
    hash: vi.fn().mockResolvedValue('$argon2id$fake-hash'),
    verify: vi.fn(),
  } as unknown as PasswordHashService;

  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const fakeTx = Symbol('tx');
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(fakeTx)),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

  return {
    useCase: new CreateIdentityUseCase(repository, passwordHashService, auditLogService, db, logger),
    repository,
    passwordHashService,
    auditLogService,
    fakeTx,
  };
}

describe('CreateIdentityUseCase (IDN-001)', () => {
  it('cria Identity com status PENDING_EMAIL_VERIFICATION (BR-004)', async () => {
    const { useCase } = makeUseCase();
    const response = await useCase.execute(request);
    expect(response.status).toBe(IDENTITY_STATUS.PENDING_EMAIL_VERIFICATION);
    expect(response.identityId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('persiste apenas o hash da senha, nunca o texto puro (BR-002/003)', async () => {
    const { useCase, repository, passwordHashService } = makeUseCase();
    await useCase.execute(request);

    expect(passwordHashService.hash).toHaveBeenCalledWith(request.password);
    const savedIdentity = vi.mocked(repository.save).mock.calls[0]?.[0];
    expect(savedIdentity?.passwordHash).toBe('$argon2id$fake-hash');
    expect(JSON.stringify(savedIdentity)).not.toContain(request.password);
  });

  it('rejeita e-mail duplicado sem criar Identity (BR-001/006)', async () => {
    const { useCase, repository } = makeUseCase({ emailExists: true });
    await expect(useCase.execute(request)).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('grava auditoria na mesma transação da persistência', async () => {
    const { useCase, repository, auditLogService, fakeTx } = makeUseCase();
    await useCase.execute(request, {
      correlationId: '018f0000-0000-7000-8000-000000000001',
      ipAddress: '10.0.0.1',
      userAgent: 'vitest',
    });

    expect(vi.mocked(repository.save).mock.calls[0]?.[1]).toBe(fakeTx);
    const [entry, tx] = vi.mocked(auditLogService.record).mock.calls[0] ?? [];
    expect(tx).toBe(fakeTx);
    expect(entry).toMatchObject({
      operation: 'CreateIdentity',
      resource: 'Identity',
      result: 'SUCCESS',
      ipAddress: '10.0.0.1',
    });
  });
});
