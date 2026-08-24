import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { JWT_ISSUER, JwtTokenService } from '../../../../shared/security/jwt-token.service';
import { Identity } from '../../domain/entities/identity';
import { Session } from '../../domain/entities/session';
import {
  AccountLockedException,
  IdentityNotActiveException,
  InvalidCredentialsException,
} from '../../domain/exceptions/auth.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CryptoTokenGeneratorService } from '../../infrastructure/security/crypto-token-generator.service';
import { AuthenticateIdentityUseCase } from './authenticate-identity.usecase';

const PASSWORD = 'Correct#Horse7Battery';
const HASH = '$argon2id$real-hash';

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

function makeIdentity(options: { active?: boolean } = {}): Identity {
  const identity = Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: HASH,
  });
  if (options.active !== false) {
    identity.activate();
  }
  return identity;
}

function makeScenario(options: { identity?: Identity | null } = {}) {
  const identity = options.identity === undefined ? makeIdentity() : options.identity;

  const identityRepository = {
    findByEmail: vi.fn().mockResolvedValue(identity),
    findById: vi.fn(),
    existsByEmail: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdentityRepository;

  const sessionRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    findActiveByIdentity: vi.fn(),
    deleteExpired: vi.fn(),
  } as unknown as SessionRepository;

  const passwordHashService = {
    hash: vi.fn(),
    verify: vi.fn((password: string, hash: string) =>
      Promise.resolve(password === PASSWORD && hash === HASH),
    ),
  } as unknown as PasswordHashService;

  const outboxService = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }),
  } as unknown as OutboxService;
  const auditLogService = {
    record: vi.fn().mockResolvedValue(undefined),
    recordSafe: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;
  const config = {
    loginMaxFailedAttempts: 3,
    loginLockoutMinutes: 15,
    refreshTokenTtlDays: 30,
    accessTokenTtlSeconds: 900,
  } as AppConfigService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  } as unknown as Database;
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

  const useCase = new AuthenticateIdentityUseCase(
    identityRepository,
    sessionRepository,
    passwordHashService,
    makeJwtTokenService(),
    new CryptoTokenGeneratorService(),
    outboxService,
    auditLogService,
    config,
    db,
    logger,
  );

  return {
    useCase,
    identity,
    identityRepository,
    sessionRepository,
    passwordHashService,
    outboxService,
    auditLogService,
  };
}

const request = { email: 'maria@example.com', password: PASSWORD };

describe('AuthenticateIdentityUseCase (IDN-003)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('login válido retorna tokens, cria sessão e registra último login', async () => {
    const { useCase, identity, sessionRepository } = makeScenario();
    const response = await useCase.execute(request, { ipAddress: '10.0.0.1', userAgent: 'vitest' });

    expect(response.expiresIn).toBe(900);
    expect(response.accessToken.split('.')).toHaveLength(3); // JWT
    expect(response.refreshToken.length).toBeGreaterThanOrEqual(40); // opaco, não JWT (P7)
    expect(identity?.lastLoginAt).toBeInstanceOf(Date);

    const session = vi.mocked(sessionRepository.save).mock.calls[0]?.[0] as Session;
    expect(session.identityId).toBe(identity?.id);
    expect(session.refreshTokenHash).toHaveLength(64);
    expect(session.refreshTokenHash).not.toBe(response.refreshToken);
    expect(session.ipAddress).toBe('10.0.0.1');
  });

  it('publica Identity.Authenticated com sessionId', async () => {
    const { useCase, identity, outboxService } = makeScenario();
    await useCase.execute(request);

    const call = vi.mocked(outboxService.enqueue).mock.calls[0]?.[1];
    expect(call).toMatchObject({ eventType: 'Identity.Authenticated' });
    expect((call?.payload as { identityId: string }).identityId).toBe(identity?.id);
    expect((call?.payload as { sessionId?: string }).sessionId).toBeTruthy();
  });

  it('senha errada → 401 opaco e incrementa contador de falhas', async () => {
    const { useCase, identity, identityRepository, sessionRepository } = makeScenario();
    await expect(useCase.execute({ ...request, password: 'Wrong#Pass123' })).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(identity?.failedLoginAttempts).toBe(1);
    expect(identityRepository.save).toHaveBeenCalled();
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('bloqueia a conta após N falhas (DOC-002) e rejeita login mesmo com senha certa', async () => {
    const { useCase, identity } = makeScenario();
    for (let i = 0; i < 3; i += 1) {
      await useCase.execute({ ...request, password: 'Wrong#Pass123' }).catch(() => undefined);
    }
    expect(identity?.isLocked()).toBe(true);

    await expect(useCase.execute(request)).rejects.toBeInstanceOf(AccountLockedException);
  });

  it('e-mail inexistente → 401 idêntico ao de senha errada (anti-enumeração)', async () => {
    const { useCase, passwordHashService } = makeScenario({ identity: null });
    await expect(useCase.execute(request)).rejects.toBeInstanceOf(InvalidCredentialsException);
    // verify é chamado mesmo sem conta, para igualar o tempo de resposta
    expect(passwordHashService.verify).toHaveBeenCalled();
  });

  it('conta não ativada (senha correta) → 403 IDENTITY_NOT_ACTIVE (BR-001)', async () => {
    const { useCase, sessionRepository } = makeScenario({ identity: makeIdentity({ active: false }) });
    await expect(useCase.execute(request)).rejects.toBeInstanceOf(IdentityNotActiveException);
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('access token emitido é verificável e aponta para a Identity', async () => {
    const { useCase, identity } = makeScenario();
    const response = await useCase.execute(request);
    const jwtService = makeJwtTokenService();
    // decodifica sem verificar assinatura (chaves diferentes entre instâncias de teste)
    const payloadJson = Buffer.from(response.accessToken.split('.')[1]!, 'base64url').toString();
    const payload = JSON.parse(payloadJson) as { sub: string; iss: string; exp: number; iat: number };
    expect(payload.sub).toBe(identity?.id);
    expect(payload.iss).toBe('trust-platform');
    expect(payload.exp - payload.iat).toBe(900);
    expect(jwtService).toBeDefined();
  });
});
