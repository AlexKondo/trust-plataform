import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../audit/audit-log.service';
import { Database } from '../database/database.module';
import { RiskFlagService } from './risk-flag.service';
import {
  RiskFlagAlreadyReviewedException,
  RiskFlagNotFoundException,
} from './safety.exceptions';

const logger = () =>
  ({ setContext: vi.fn(), warn: vi.fn() }) as unknown as PinoLogger;
const auditMock = () =>
  ({ record: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditLogService;

describe('RiskFlagService (IP-014)', () => {
  it('raise() grava o flag e uma entrada de auditoria explicável', async () => {
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({
        values: (values: unknown) => {
          inserted.push(values);
          return Promise.resolve(undefined);
        },
      }),
    } as unknown as Database;
    const audit = auditMock();
    const service = new RiskFlagService(db, audit, logger());

    const id = await service.raise({
      entityType: 'TrustChangeOrder',
      entityId: 'co-1',
      subjectIdentityId: 'identity-1',
      signal: 'HIGH_CHANGE_ORDER_COUNT',
      reason: 'Order has reached 5 change orders.',
      metadata: { changeOrderCount: 5 },
    });

    expect(id).toBeTruthy();
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { status: string }).status).toBe('OPEN');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'RaiseRiskFlag', resource: 'TrustChangeOrder' }),
      undefined,
    );
  });

  it('review() rejeita revisar um flag inexistente', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    } as unknown as Database;
    const service = new RiskFlagService(db, auditMock(), logger());

    await expect(
      service.review('missing-id', 'admin-1', 'CONFIRMED', undefined, {}),
    ).rejects.toBeInstanceOf(RiskFlagNotFoundException);
  });

  it('review() rejeita revisar um flag já fechado', async () => {
    const existing = { id: 'flag-1', status: 'CONFIRMED', entityType: 'TrustChangeOrder', entityId: 'co-1' };
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([existing]) }) }),
    } as unknown as Database;
    const service = new RiskFlagService(db, auditMock(), logger());

    await expect(
      service.review('flag-1', 'admin-1', 'DISMISSED', undefined, {}),
    ).rejects.toBeInstanceOf(RiskFlagAlreadyReviewedException);
  });
});
