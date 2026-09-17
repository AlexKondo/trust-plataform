import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { WebhookSignatureService } from '../domain/webhook-signature.service';
import { WebhookSubscriptionRow } from '../infrastructure/persistence/webhook-subscriptions.schema';
import { WEBHOOK_MAX_DELIVERY_ATTEMPTS } from './webhook-delivery.constants';
import { WebhookDeliveryService } from './webhook-delivery.service';

interface FakeDeliveryRow {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  status: string;
  attempts: number;
}

interface ReceivedWebhookEnvelope {
  payloadVersion: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  deliveryAttempt: number;
  data: Record<string, unknown>;
}

function makeRepository() {
  const deliveries = new Map<string, FakeDeliveryRow>();
  let seq = 0;
  return {
    findActiveBySubscribedEventType: vi.fn<() => Promise<WebhookSubscriptionRow[]>>(),
    createPendingDelivery: vi.fn(
      (subscriptionId: string, eventId: string, eventType: string): Promise<FakeDeliveryRow> => {
        const key = `${subscriptionId}:${eventId}`;
        const existing = deliveries.get(key);
        if (existing) {
          return Promise.resolve(existing);
        }
        seq += 1;
        const row: FakeDeliveryRow = {
          id: `delivery-${seq}`,
          subscriptionId,
          eventId,
          eventType,
          status: 'PENDING',
          attempts: 0,
        };
        deliveries.set(key, row);
        return Promise.resolve(row);
      },
    ),
    recordAttemptResult: vi.fn(
      (
        deliveryId: string,
        result: { success: boolean; deadLetter: boolean; responseStatus?: number; error?: string },
      ): Promise<void> => {
        for (const row of deliveries.values()) {
          if (row.id === deliveryId) {
            row.attempts += 1;
            row.status = result.success ? 'SUCCESS' : result.deadLetter ? 'DEAD_LETTER' : 'PENDING';
          }
        }
        return Promise.resolve();
      },
    ),
  };
}

const noopExecutor = {} as DatabaseExecutor;

const envelope: ConsumedEvent = {
  eventId: 'evt-1',
  eventType: 'MarketplaceOrder.Completed',
  eventVersion: '1.0',
  occurredAt: '2026-01-01T00:00:00Z',
  producer: 'marketplace-service',
  correlationId: 'corr-1',
  payload: {
    orderId: 'order-1',
    buyerId: 'b1',
    sellerId: 's1',
    amount: 1000,
    currency: 'BRL',
    status: 'COMPLETED',
    completedAt: '2026-01-01T00:00:00Z',
  },
};

function fakeSubscription(overrides: Partial<WebhookSubscriptionRow> = {}): WebhookSubscriptionRow {
  return {
    id: 'sub-1',
    url: 'https://partner.example.com/hook',
    description: null,
    eventTypes: ['MarketplaceOrder.Completed'],
    secretActive: 'my-secret',
    secretPrevious: null,
    secretRotatedAt: null,
    active: true,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const noopLogger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() };

describe('WebhookDeliveryService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let service: WebhookDeliveryService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    repository = makeRepository();
    service = new WebhookDeliveryService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- lightweight hand-rolled test double, not the real repository type.
      repository as any,
      new WebhookSignatureService(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- Pino's real type isn't relevant to this unit test.
      noopLogger as any,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns true (nothing to do) when no subscription is subscribed to the event type', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([]);
    const allDone = await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(allDone).toBe(true);
  });

  it('signs the POST body with the subscription active secret and sends it in X-Trust-Webhook-Signature', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([fakeSubscription()]);
    let capturedSignature: string | undefined;
    let capturedBody: string | undefined;
    global.fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedSignature = headers['X-Trust-Webhook-Signature'];
      capturedBody = init?.body as string;
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const allDone = await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);

    expect(allDone).toBe(true);
    expect(capturedSignature).toMatch(/^[0-9a-f]{64}$/);
    const parsed = JSON.parse(capturedBody!) as ReceivedWebhookEnvelope;
    expect(parsed.payloadVersion).toBe('1');
    expect(parsed.eventId).toBe('evt-1');
    expect(parsed.eventType).toBe('MarketplaceOrder.Completed');
    expect(parsed.deliveryAttempt).toBe(1);
    // Only allowlisted fields — no internal-only fields fabricated/leaked.
    expect(parsed.data).toEqual({
      orderId: 'order-1',
      buyerId: 'b1',
      sellerId: 's1',
      amount: 1000,
      currency: 'BRL',
      completedAt: '2026-01-01T00:00:00Z',
      status: 'COMPLETED',
    });
  });

  it('does not re-POST to a subscription whose delivery already succeeded for this eventId (idempotent retry)', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([fakeSubscription()]);
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));

    await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Simulate outbox retry redelivering the same event.
    await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(global.fetch).toHaveBeenCalledTimes(1); // no second POST — already SUCCESS
  });

  it('returns false while a subscription has not reached a terminal state, so the caller retries', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([fakeSubscription()]);
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response));

    const allDone = await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(allDone).toBe(false);
  });

  it('moves a delivery to DEAD_LETTER after WEBHOOK_MAX_DELIVERY_ATTEMPTS failures, then stops retrying it', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([fakeSubscription()]);
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response));

    let allDone = false;
    for (let i = 0; i < WEBHOOK_MAX_DELIVERY_ATTEMPTS; i += 1) {
      allDone = await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    }
    expect(allDone).toBe(true); // DEAD_LETTER counts as terminal/"done" for the outbox row
    expect(global.fetch).toHaveBeenCalledTimes(WEBHOOK_MAX_DELIVERY_ATTEMPTS);

    // One more drain must NOT re-attempt the dead-lettered subscription.
    await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(global.fetch).toHaveBeenCalledTimes(WEBHOOK_MAX_DELIVERY_ATTEMPTS);
  });

  it('treats a network error the same as a failed response for retry accounting', async () => {
    repository.findActiveBySubscribedEventType.mockResolvedValue([fakeSubscription()]);
    global.fetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));

    const allDone = await service.deliverToSubscribers('MarketplaceOrder.Completed', envelope, noopExecutor);
    expect(allDone).toBe(false);
  });
});
