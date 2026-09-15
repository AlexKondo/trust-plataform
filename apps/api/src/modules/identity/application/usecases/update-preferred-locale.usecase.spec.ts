import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { Identity } from '../../domain/entities/identity';
import { IdentityNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { UpdatePreferredLocaleUseCase } from './update-preferred-locale.usecase';

function makeIdentity(): Identity {
  const identity = Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: '$argon2id$secret-hash',
  });
  identity.activate();
  return identity;
}

function makeUseCase(identity: Identity | null) {
  const repository = {
    findById: vi.fn().mockResolvedValue(identity),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdentityRepository;
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const fakeTx = Symbol('tx');
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(fakeTx)),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn() } as unknown as PinoLogger;

  return {
    useCase: new UpdatePreferredLocaleUseCase(repository, auditLogService, db, logger),
    repository,
    auditLogService,
    db,
    fakeTx,
  };
}

describe('UpdatePreferredLocaleUseCase (IP-002)', () => {
  it('PT-BR default no cadastro (nenhum locale informado)', () => {
    const identity = makeIdentity();
    expect(identity.preferredLocale).toBe('pt-BR');
  });

  it('atualiza a preferência para um locale secundário suportado (en-US)', async () => {
    const identity = makeIdentity();
    const { useCase, repository } = makeUseCase(identity);

    const response = await useCase.execute(identity.id, { preferredLocale: 'en-US' });

    expect(response.preferredLocale).toBe('en-US');
    expect(repository.save).toHaveBeenCalledOnce();
    expect(identity.preferredLocale).toBe('en-US');
  });

  it('grava auditoria na mesma transação da persistência', async () => {
    const identity = makeIdentity();
    const { useCase, auditLogService, fakeTx } = makeUseCase(identity);

    await useCase.execute(
      identity.id,
      { preferredLocale: 'en-US' },
      { correlationId: '018f0000-0000-7000-8000-000000000001' },
    );

    const [entry, tx] = vi.mocked(auditLogService.record).mock.calls[0] ?? [];
    expect(tx).toBe(fakeTx);
    expect(entry).toMatchObject({
      operation: 'UpdatePreferredLocale',
      resource: 'Identity',
      result: 'SUCCESS',
      metadata: { preferredLocale: 'en-US' },
    });
  });

  it('é idempotente: reenviar o mesmo locale não persiste nem audita de novo', async () => {
    const identity = makeIdentity();
    const { useCase, repository, auditLogService } = makeUseCase(identity);

    await useCase.execute(identity.id, { preferredLocale: 'pt-BR' });

    expect(repository.save).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('Identity inexistente → 404', async () => {
    const { useCase } = makeUseCase(null);
    await expect(useCase.execute('missing-id', { preferredLocale: 'en-US' })).rejects.toBeInstanceOf(
      IdentityNotFoundException,
    );
  });
});
