import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookSubscriptionService } from './webhook-subscription.service';

function makeRepository() {
  return {
    create: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    findActiveBySubscribedEventType: vi.fn(),
    updateUrlAndEvents: vi.fn(),
    setActive: vi.fn(),
    rotateSecret: vi.fn(),
    clearPreviousSecret: vi.fn(),
    deliveryHealth: vi.fn(),
    listDeliveries: vi.fn(),
  };
}

function makeAuditLog() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe('WebhookSubscriptionService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let auditLog: ReturnType<typeof makeAuditLog>;
  let service: WebhookSubscriptionService;

  beforeEach(() => {
    repository = makeRepository();
    auditLog = makeAuditLog();
    service = new WebhookSubscriptionService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- lightweight hand-rolled test doubles, not the real repository/audit types.
      repository as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      auditLog as any,
    );
  });

  describe('create', () => {
    it('rejects a non-https URL', async () => {
      await expect(
        service.create('admin-1', { url: 'http://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects an event type outside the allowlist', async () => {
      await expect(
        service.create('admin-1', { url: 'https://partner.example.com/hook', eventTypes: ['Payment.Authorized'] }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects an empty event type list', async () => {
      await expect(
        service.create('admin-1', { url: 'https://partner.example.com/hook', eventTypes: [] }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('generates a random secret, persists it, audits, and returns the plaintext secret exactly once', async () => {
      repository.create.mockResolvedValue({
        id: 'sub-1',
        url: 'https://partner.example.com/hook',
        description: null,
        eventTypes: ['MarketplaceOrder.Completed'],
        secretActive: 'irrelevant-because-mocked',
        secretPrevious: null,
        secretRotatedAt: null,
        active: true,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        'admin-1',
        { url: 'https://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
        { ipAddress: '127.0.0.1', correlationId: 'corr-1' },
      );

      expect(repository.create).toHaveBeenCalledTimes(1);
      const insertedRow = repository.create.mock.calls[0]![0] as { secretActive: string };
      expect(insertedRow.secretActive).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
      expect(result.secret).toBe(insertedRow.secretActive);
      // The view returned to the caller never carries the secret fields.
      expect(result.subscription).not.toHaveProperty('secretActive');
      expect(result.subscription).not.toHaveProperty('secretPrevious');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'WEBHOOK_SUBSCRIPTION_CREATED', identityId: 'admin-1' }),
      );
    });
  });

  describe('get/list — secrets never leak on read', () => {
    it('get() never exposes secretActive/secretPrevious', async () => {
      repository.findById.mockResolvedValue({
        id: 'sub-1',
        secretActive: 'super-secret',
        secretPrevious: 'old-secret',
        url: 'https://x.example.com',
        eventTypes: [],
        active: true,
      });
      const view = await service.get('sub-1');
      expect(view).not.toHaveProperty('secretActive');
      expect(view).not.toHaveProperty('secretPrevious');
    });

    it('get() throws NotFoundException for an unknown id', async () => {
      repository.findById.mockResolvedValue(undefined);
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rotateSecret / confirmRotation', () => {
    it('rotateSecret generates a new secret and returns it once, moving the old one to secretPrevious', async () => {
      repository.rotateSecret.mockResolvedValue({
        id: 'sub-1',
        secretActive: 'new-secret-value',
        secretPrevious: 'old-secret-value',
        url: 'https://x.example.com',
        eventTypes: [],
        active: true,
      });

      const result = await service.rotateSecret('sub-1', 'admin-1', {});
      const newSecretArg = repository.rotateSecret.mock.calls[0]![1] as string;
      expect(newSecretArg).toMatch(/^[0-9a-f]{64}$/);
      expect(result.secret).toBe(newSecretArg);
      expect(result.subscription).not.toHaveProperty('secretPrevious');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'WEBHOOK_SUBSCRIPTION_SECRET_ROTATED' }),
      );
    });

    it('confirmRotation clears the previous secret and audits the confirmation', async () => {
      repository.clearPreviousSecret.mockResolvedValue({
        id: 'sub-1',
        secretActive: 'new-secret-value',
        secretPrevious: null,
        url: 'https://x.example.com',
        eventTypes: [],
        active: true,
      });
      await service.confirmRotation('sub-1', 'admin-1', {});
      expect(repository.clearPreviousSecret).toHaveBeenCalledWith('sub-1');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'WEBHOOK_SUBSCRIPTION_ROTATION_CONFIRMED' }),
      );
    });

    it('rotateSecret throws NotFoundException for an unknown subscription', async () => {
      repository.rotateSecret.mockResolvedValue(undefined);
      await expect(service.rotateSecret('missing', 'admin-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setActive (disable/enable)', () => {
    it('disables a subscription and audits it', async () => {
      repository.setActive.mockResolvedValue({
        id: 'sub-1',
        secretActive: 's',
        secretPrevious: null,
        url: 'https://x.example.com',
        eventTypes: [],
        active: false,
      });
      await service.setActive('sub-1', false, 'admin-1', {});
      expect(repository.setActive).toHaveBeenCalledWith('sub-1', false);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'WEBHOOK_SUBSCRIPTION_DISABLED' }),
      );
    });
  });
});
