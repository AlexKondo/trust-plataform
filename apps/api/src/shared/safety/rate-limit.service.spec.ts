import { describe, expect, it } from 'vitest';
import { Database } from '../database/database.module';
import { RateLimitService } from './rate-limit.service';
import { SensitiveActionRateLimitExceededException } from './safety.exceptions';

function dbMock(count: number): Database {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count }]),
      }),
    }),
  } as unknown as Database;
}

describe('RateLimitService (IP-014)', () => {
  it('permite quando a contagem recente está abaixo do limite', async () => {
    const service = new RateLimitService(dbMock(2));
    await expect(
      service.assertWithinLimit('identity-1', 'ForgotPassword', {
        maxAttempts: 5,
        windowMinutes: 60,
      }),
    ).resolves.toBeUndefined();
  });

  it('lança SensitiveActionRateLimitExceededException quando o limite foi atingido', async () => {
    const service = new RateLimitService(dbMock(5));
    await expect(
      service.assertWithinLimit('identity-1', 'ForgotPassword', {
        maxAttempts: 5,
        windowMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(SensitiveActionRateLimitExceededException);
  });

  it('lança quando a contagem excede o limite', async () => {
    const service = new RateLimitService(dbMock(9));
    await expect(
      service.assertWithinLimit('identity-1', 'CreateTrustChangeOrder', {
        maxAttempts: 5,
        windowMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(SensitiveActionRateLimitExceededException);
  });

  it('trata contagem ausente como zero (nunca falha por linha vazia)', async () => {
    const service = new RateLimitService({
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    } as unknown as Database);
    await expect(
      service.assertWithinLimit('identity-1', 'ForgotPassword', {
        maxAttempts: 5,
        windowMinutes: 60,
      }),
    ).resolves.toBeUndefined();
  });
});
