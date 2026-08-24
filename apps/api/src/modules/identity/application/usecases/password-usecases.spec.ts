import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { Identity } from '../../domain/entities/identity';
import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { Session } from '../../domain/entities/session';
import {
  CurrentPasswordInvalidException,
  ExpiredResetTokenException,
  InvalidResetTokenException,
  SamePasswordException,
} from '../../domain/exceptions/password.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { EmailService } from '../../domain/services/email.service';
import { PasswordBreachService } from '../../domain/services/password-breach.service';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CryptoTokenGeneratorService } from '../../infrastructure/security/crypto-token-generator.service';
import { ChangePasswordUseCase } from './change-password.usecase';
import { ForgotPasswordUseCase } from './forgot-password.usecase';
import { ResetPasswordUseCase } from './reset-password.usecase';

const tokenGenerator = new CryptoTokenGeneratorService();
const OLD_PASSWORD = 'Old#Password1234';
const NEW_PASSWORD = 'New#Password5678';
const OLD_HASH = '$argon2id$old-hash';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;
const dbMock = () =>
  ({
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(Symbol('tx'))),
  }) as unknown as Database;
const auditMock = () =>
  ({
    record: vi.fn().mockResolvedValue(undefined),
    recordSafe: vi.fn().mockResolvedValue(undefined),
  }) as unknown as AuditLogService;
const outboxMock = () =>
  ({ enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }) }) as unknown as OutboxService;
const hashMock = () =>
  ({
    hash: vi.fn().mockResolvedValue('$argon2id$new-hash'),
    verify: vi.fn((password: string, hash: string) =>
      Promise.resolve(password === OLD_PASSWORD && hash === OLD_HASH),
    ),
  }) as unknown as PasswordHashService;
const breachMock = () =>
  ({ isBreached: vi.fn().mockResolvedValue(false) }) as unknown as PasswordBreachService;

function makeIdentity(): Identity {
  const identity = Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: OLD_HASH,
  });
  identity.activate();
  return identity;
}

describe('ForgotPasswordUseCase (IDN-007)', () => {
  function makeScenario(identity: Identity | null) {
    const identityRepository = {
      findByEmail: vi.fn().mockResolvedValue(identity),
    } as unknown as IdentityRepository;
    const tokenRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      invalidateActiveByIdentity: vi.fn().mockResolvedValue(undefined),
    } as unknown as PasswordResetTokenRepository;
    const emailService = {
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;
    const outboxService = outboxMock();
    const useCase = new ForgotPasswordUseCase(
      identityRepository,
      tokenRepository,
      tokenGenerator,
      emailService,
      outboxService,
      auditMock(),
      { passwordResetTtlMinutes: 30, appBaseUrl: 'http://localhost:3000' } as AppConfigService,
      dbMock(),
      logger(),
    );
    return { useCase, tokenRepository, emailService, outboxService };
  }

  it('conta existente: invalida tokens antigos, salva novo (só hash) e envia e-mail', async () => {
    const identity = makeIdentity();
    const { useCase, tokenRepository, emailService, outboxService } = makeScenario(identity);

    const response = await useCase.execute({ email: identity.email });

    expect(response.message).toContain('If an account exists');
    expect(tokenRepository.invalidateActiveByIdentity).toHaveBeenCalled();
    const saved = vi.mocked(tokenRepository.save).mock.calls[0]?.[0] as PasswordResetToken;
    expect(saved.tokenHash).toHaveLength(64);
    const emailCall = vi.mocked(emailService.sendPasswordResetEmail).mock.calls[0]?.[0];
    expect(emailCall?.resetUrl).toContain('/reset-password?token=');
    expect(emailCall?.resetUrl).not.toContain(saved.tokenHash); // link leva o token, nunca o hash
    expect(vi.mocked(outboxService.enqueue).mock.calls[0]?.[1]).toMatchObject({
      eventType: 'Identity.PasswordRecoveryRequested',
    });
  });

  it('conta inexistente: MESMA resposta, sem e-mail e sem evento (BR-003)', async () => {
    const { useCase, emailService, outboxService } = makeScenario(null);
    const response = await useCase.execute({ email: 'nao-existe@example.com' });

    expect(response.message).toContain('If an account exists');
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(outboxService.enqueue).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordUseCase (IDN-008)', () => {
  function makeScenario(options: { ttlMinutes?: number; used?: boolean } = {}) {
    const identity = makeIdentity();
    const raw = tokenGenerator.generate();
    const token = PasswordResetToken.createNew({
      identityId: identity.id,
      tokenHash: raw.tokenHash,
      ttlMinutes: options.ttlMinutes ?? 30,
    });
    if (options.used) {
      token.markUsed();
    }

    const identityRepository = {
      findById: vi.fn().mockResolvedValue(identity),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdentityRepository;
    const tokenRepository = {
      findByTokenHash: vi.fn((hash: string) =>
        Promise.resolve(hash === token.tokenHash ? token : null),
      ),
      markAsUsed: vi.fn().mockResolvedValue(undefined),
      invalidateActiveByIdentity: vi.fn().mockResolvedValue(undefined),
    } as unknown as PasswordResetTokenRepository;
    const sessionRepository = {
      revokeAllByIdentity: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;
    const outboxService = outboxMock();
    const passwordHashService = hashMock();
    const useCase = new ResetPasswordUseCase(
      identityRepository,
      tokenRepository,
      sessionRepository,
      passwordHashService,
      breachMock(),
      tokenGenerator,
      outboxService,
      auditMock(),
      dbMock(),
      logger(),
    );
    return {
      useCase,
      identity,
      rawToken: raw.token,
      sessionRepository,
      tokenRepository,
      outboxService,
      passwordHashService,
    };
  }

  it('redefine a senha, invalida tokens e revoga TODAS as sessões (BR-006)', async () => {
    const { useCase, identity, rawToken, sessionRepository, tokenRepository, outboxService } =
      makeScenario();

    await useCase.execute({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(identity.passwordHash).toBe('$argon2id$new-hash');
    expect(sessionRepository.revokeAllByIdentity).toHaveBeenCalledWith(
      identity.id,
      expect.anything(),
    );
    expect(tokenRepository.markAsUsed).toHaveBeenCalled();
    expect(tokenRepository.invalidateActiveByIdentity).toHaveBeenCalled();
    expect(vi.mocked(outboxService.enqueue).mock.calls[0]?.[1]).toMatchObject({
      eventType: 'Identity.PasswordReset',
    });
  });

  it('token desconhecido → 401', async () => {
    const { useCase } = makeScenario();
    await expect(
      useCase.execute({ token: 'token-desconhecido-de-teste', newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidResetTokenException);
  });

  it('token já usado → 401 (BR-003)', async () => {
    const { useCase, rawToken } = makeScenario({ used: true });
    await expect(
      useCase.execute({ token: rawToken, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidResetTokenException);
  });

  it('token expirado → 401 (BR-002)', async () => {
    const { useCase, rawToken } = makeScenario({ ttlMinutes: -1 });
    await expect(
      useCase.execute({ token: rawToken, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ExpiredResetTokenException);
  });
});

describe('ChangePasswordUseCase (IDN-009)', () => {
  function makeScenario() {
    const identity = makeIdentity();
    const currentSession = Session.createNew({
      identityId: identity.id,
      refreshTokenHash: 'b'.repeat(64),
      accessTokenId: 'current-jti',
      ttlDays: 30,
    });
    const identityRepository = {
      findById: vi.fn().mockResolvedValue(identity),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdentityRepository;
    const sessionRepository = {
      findByAccessTokenId: vi.fn().mockResolvedValue(currentSession),
      revokeAllByIdentityExcept: vi.fn().mockResolvedValue(undefined),
      revokeAllByIdentity: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;
    const outboxService = outboxMock();
    const useCase = new ChangePasswordUseCase(
      identityRepository,
      sessionRepository,
      hashMock(),
      breachMock(),
      outboxService,
      auditMock(),
      dbMock(),
      logger(),
    );
    return { useCase, identity, currentSession, sessionRepository, outboxService };
  }

  const authenticated = { identityId: 'x', tokenId: 'current-jti' };

  it('troca a senha e revoga as demais sessões, preservando a atual (BR-007)', async () => {
    const { useCase, identity, currentSession, sessionRepository, outboxService } = makeScenario();

    await useCase.execute(authenticated, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(identity.passwordHash).toBe('$argon2id$new-hash');
    expect(sessionRepository.revokeAllByIdentityExcept).toHaveBeenCalledWith(
      identity.id,
      currentSession.id,
      expect.anything(),
    );
    expect(vi.mocked(outboxService.enqueue).mock.calls[0]?.[1]).toMatchObject({
      eventType: 'Identity.PasswordChanged',
    });
  });

  it('senha atual errada → 401 e nada muda (BR-003)', async () => {
    const { useCase, identity, sessionRepository } = makeScenario();
    await expect(
      useCase.execute(authenticated, {
        currentPassword: 'Wrong#Password99',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordInvalidException);
    expect(identity.passwordHash).toBe(OLD_HASH);
    expect(sessionRepository.revokeAllByIdentityExcept).not.toHaveBeenCalled();
  });

  it('nova senha igual à atual → 422 (BR-005)', async () => {
    const { useCase } = makeScenario();
    await expect(
      useCase.execute(authenticated, {
        currentPassword: OLD_PASSWORD,
        newPassword: OLD_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(SamePasswordException);
  });
});
