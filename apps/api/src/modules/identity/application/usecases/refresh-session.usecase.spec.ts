import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { JWT_ISSUER, JwtTokenService } from '../../../../shared/security/jwt-token.service';
import { Identity } from '../../domain/entities/identity';
import { Session } from '../../domain/entities/session';
import { IdentityNotActiveException } from '../../domain/exceptions/auth.exceptions';
import {
  ExpiredRefreshTokenException,
  InvalidRefreshTokenException,
  RevokedSessionException,
} from '../../domain/exceptions/refresh.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { CryptoTokenGeneratorService } from '../../infrastructure/security/crypto-token-generator.service';
import { RefreshSessionUseCase } from './refresh-session.usecase';

const tokenGenerator = new CryptoTokenGeneratorService();

function makeJwtTokenService(): JwtTokenService {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwt = new JwtService({
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signOptions: { algorithm: 'ES256', issuer: JWT_ISSUER },
    verifyOptions: { algorithms: ['ES256'], issuer: JWT_ISSUER },
  });
  return new JwtTokenService(jwt, { accessTokenTtlSeconds: 900 } as AppConfigService);
}

function makeScenario(
  options: { active?: boolean; revoked?: boolean; ttlDays?: number } = {},
) {
  const identity = Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: '$argon2id$fake',
  });
  if (options.active !== false) {
    identity.activate();
  }

  const refresh = tokenGenerator.generate();
  const session = Session.createNew({
    identityId: identity.id,
    refreshTokenHash: refresh.tokenHash,
    accessTokenId: 'old-access-token-id',
    ttlDays: options.ttlDays ?? 30,
  });
  if (options.revoked) {
    session.revoke();
  }

  const sessionRepository = {
    findByRefreshTokenHash: vi.fn((hash: string) =>
      Promise.resolve(hash === session.refreshTokenHash ? session : null),
    ),
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findActiveByIdentity: vi.fn(),
    deleteExpired: vi.fn(),
  } as unknown as SessionRepository;

  const identityRepository = {
    findById: vi.fn().mockResolvedValue(identity),
    findByEmail: vi.fn(),
    existsByEmail: vi.fn(),
    save: vi.fn(),
  } as unknown as IdentityRepository;

  const outboxService = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }),
  } as unknown as OutboxService;
  const auditLogService = {
    record: vi.fn().mockResolvedValue(undefined),
    recordSafe: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

  const useCase = new RefreshSessionUseCase(
    identityRepository,
    sessionRepository,
    makeJwtTokenService(),
    tokenGenerator,
    outboxService,
    auditLogService,
    { accessTokenTtlSeconds: 900 } as AppConfigService,
    db,
    logger,
  );

  return { useCase, identity, session, rawRefreshToken: refresh.token, outboxService, sessionRepository };
}

describe('RefreshSessionUseCase (IDN-004)', () => {
  it('renova a sessão: novos tokens, rotação do hash e last access atualizado (BR-005/006)', async () => {
    const { useCase, session, rawRefreshToken } = makeScenario();
    const oldHash = session.refreshTokenHash;
    const oldLastAccess = session.lastAccessAt;

    const response = await useCase.execute({ refreshToken: rawRefreshToken });

    expect(response.expiresIn).toBe(900);
    expect(response.accessToken.split('.')).toHaveLength(3);
    expect(response.refreshToken).not.toBe(rawRefreshToken);
    expect(session.refreshTokenHash).not.toBe(oldHash);
    expect(session.refreshTokenHash).toBe(tokenGenerator.hash(response.refreshToken));
    expect(session.lastAccessAt.getTime()).toBeGreaterThanOrEqual(oldLastAccess.getTime());
    expect(session.accessTokenId).not.toBe('old-access-token-id');
  });

  it('o refresh token anterior deixa de funcionar após a rotação (BR-005)', async () => {
    const { useCase, rawRefreshToken } = makeScenario();
    await useCase.execute({ refreshToken: rawRefreshToken });

    await expect(useCase.execute({ refreshToken: rawRefreshToken })).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('token desconhecido → 401 INVALID_REFRESH_TOKEN (BR-001)', async () => {
    const { useCase } = makeScenario();
    await expect(
      useCase.execute({ refreshToken: 'um-token-desconhecido-de-teste' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('sessão revogada → 401 SESSION_REVOKED (BR-003/007)', async () => {
    const { useCase, rawRefreshToken } = makeScenario({ revoked: true });
    await expect(useCase.execute({ refreshToken: rawRefreshToken })).rejects.toBeInstanceOf(
      RevokedSessionException,
    );
  });

  it('sessão expirada → 401 EXPIRED_REFRESH_TOKEN (BR-002)', async () => {
    const { useCase, rawRefreshToken } = makeScenario({ ttlDays: -1 });
    await expect(useCase.execute({ refreshToken: rawRefreshToken })).rejects.toBeInstanceOf(
      ExpiredRefreshTokenException,
    );
  });

  it('identity não ativa → 403 e nada é rotacionado (BR-004)', async () => {
    const { useCase, rawRefreshToken, sessionRepository } = makeScenario({ active: false });
    await expect(useCase.execute({ refreshToken: rawRefreshToken })).rejects.toBeInstanceOf(
      IdentityNotActiveException,
    );
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('publica Session.Refreshed com sessionId e identityId', async () => {
    const { useCase, session, identity, rawRefreshToken, outboxService } = makeScenario();
    await useCase.execute({ refreshToken: rawRefreshToken });

    const call = vi.mocked(outboxService.enqueue).mock.calls[0]?.[1];
    expect(call).toMatchObject({ eventName: 'Session.Refreshed' });
    expect(call?.payload).toMatchObject({ sessionId: session.id, identityId: identity.id });
  });
});
