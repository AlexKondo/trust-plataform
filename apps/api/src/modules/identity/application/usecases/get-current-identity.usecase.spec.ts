import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { Identity } from '../../domain/entities/identity';
import { IdentityNotActiveException } from '../../domain/exceptions/auth.exceptions';
import { IdentityNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { GetCurrentIdentityUseCase } from './get-current-identity.usecase';

function makeUseCase(identity: Identity | null) {
  const repository = {
    findById: vi.fn().mockResolvedValue(identity),
  } as unknown as IdentityRepository;
  const logger = { setContext: vi.fn(), info: vi.fn() } as unknown as PinoLogger;
  return new GetCurrentIdentityUseCase(repository, logger);
}

function makeIdentity(options: { active?: boolean } = {}): Identity {
  const identity = Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: '$argon2id$secret-hash',
  });
  if (options.active !== false) {
    identity.activate();
    identity.registerSuccessfulLogin();
  }
  return identity;
}

describe('GetCurrentIdentityUseCase (IDN-005)', () => {
  it('retorna dados públicos da Identity autenticada', async () => {
    const identity = makeIdentity();
    const response = await makeUseCase(identity).execute(identity.id);

    expect(response).toEqual({
      identityId: identity.id,
      fullName: 'Maria Silva',
      email: 'maria@example.com',
      status: 'ACTIVE',
      createdAt: identity.createdAt.toISOString(),
      lastLoginAt: identity.lastLoginAt?.toISOString(),
      isAdmin: false,
    });
  });

  it('nunca expõe hash, tokens ou campos internos (BR-004..007)', async () => {
    const identity = makeIdentity();
    const response = await makeUseCase(identity).execute(identity.id);
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('argon2');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('failedLoginAttempts');
    expect(serialized).not.toContain('lockedUntil');
    // `isAdmin` é permissão do PRÓPRIO usuário — o frontend precisa dela para
    // decidir se mostra o painel de moderação; não é dado sensível de terceiro.
    expect(Object.keys(response).sort()).toEqual([
      'createdAt',
      'email',
      'fullName',
      'identityId',
      'isAdmin',
      'lastLoginAt',
      'status',
    ]);
  });

  it('Identity inexistente → 404', async () => {
    await expect(makeUseCase(null).execute('missing-id')).rejects.toBeInstanceOf(
      IdentityNotFoundException,
    );
  });

  it('Identity não ativa → 403 (BR-003)', async () => {
    const identity = makeIdentity({ active: false });
    await expect(makeUseCase(identity).execute(identity.id)).rejects.toBeInstanceOf(
      IdentityNotActiveException,
    );
  });
});
