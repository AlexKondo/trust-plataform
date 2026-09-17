import { describe, expect, it } from 'vitest';
import {
  WEBHOOK_ALLOWED_EVENT_TYPES,
  isAllowedWebhookEventType,
  sanitizeWebhookPayload,
} from './webhook-event-allowlist';

describe('webhook event allowlist', () => {
  it('rejects any event type not explicitly listed', () => {
    expect(isAllowedWebhookEventType('TrustScore.Calculated')).toBe(false);
    expect(isAllowedWebhookEventType('Payment.Authorized')).toBe(false);
    expect(isAllowedWebhookEventType('Identity.Created')).toBe(false);
    expect(isAllowedWebhookEventType('MarketplaceMessage.Sent')).toBe(false);
  });

  it('accepts every curated allowlist entry', () => {
    for (const eventType of WEBHOOK_ALLOWED_EVENT_TYPES) {
      expect(isAllowedWebhookEventType(eventType)).toBe(true);
    }
  });

  it('sanitizeWebhookPayload only forwards approved fields, dropping internal-only ones', () => {
    const sanitized = sanitizeWebhookPayload('MarketplaceDispute.Resolved', {
      disputeId: 'd1',
      orderId: 'o1',
      buyerId: 'b1',
      sellerId: 's1',
      decisionType: 'UPHELD',
      refundAmount: 5000,
      decidedAt: '2026-01-01T00:00:00Z',
      // fields that must NEVER leak to an external partner:
      decidedBy: 'admin-identity-id',
      faultIdentityId: 'some-identity-id',
    });
    expect(sanitized).toEqual({
      disputeId: 'd1',
      orderId: 'o1',
      buyerId: 'b1',
      sellerId: 's1',
      decisionType: 'UPHELD',
      refundAmount: 5000,
      decidedAt: '2026-01-01T00:00:00Z',
    });
    expect(sanitized).not.toHaveProperty('decidedBy');
    expect(sanitized).not.toHaveProperty('faultIdentityId');
  });

  it('sanitizeWebhookPayload never fabricates fields absent from the source payload', () => {
    const sanitized = sanitizeWebhookPayload('MarketplaceOrder.Cancelled', { orderId: 'o1' });
    expect(sanitized).toEqual({ orderId: 'o1' });
  });
});
