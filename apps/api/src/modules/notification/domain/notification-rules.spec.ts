import { describe, expect, it } from 'vitest';
import { NOTIFICATION_RULES } from './notification-rules';

/**
 * IP-013 — testes unitários das 7 regras NOVAS de `NOTIFICATION_RULES`
 * (ServiceRequestEngagement, Payment/PaymentIncrementalAuthorization/Funds,
 * Identity de segurança). As 21 regras pré-existentes (NTF-001/IP-002) já
 * são exercitadas pelos e2e existentes (`ntf-001.e2e.spec.ts` etc.) — este
 * arquivo cobre só o que esta IP acrescentou, `build()` puro, sem DB.
 */
function ruleFor(eventType: string) {
  const rule = NOTIFICATION_RULES.find((candidate) => candidate.eventType === eventType);
  if (!rule) {
    throw new Error(`Regra não encontrada para ${eventType}`);
  }
  return rule;
}

describe('NOTIFICATION_RULES — IP-013', () => {
  it('ServiceRequestEngagement.Created avisa o Partner, não o Member (autor do engajamento)', () => {
    const drafts = ruleFor('ServiceRequestEngagement.Created').build({
      serviceRequestId: 'sr-1',
      listingId: 'listing-1',
      partnerId: 'partner-1',
      conversationId: 'conv-1',
      engagedBy: 'member-1',
      engagedAt: '2026-09-15T10:00:00Z',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      identityId: 'partner-1',
      type: 'SERVICE_REQUEST_ENGAGEMENT_RECEIVED',
      resourceType: 'ServiceRequestEngagement',
      resourceId: 'sr-1',
    });
    // O Member (ator) nunca é o destinatário — mesma convenção das outras 21 regras.
    expect(drafts.map((draft) => draft.identityId)).not.toContain('member-1');
  });

  it('ServiceRequestEngagement.Created sem partnerId não gera aviso órfão', () => {
    expect(ruleFor('ServiceRequestEngagement.Created').build({ serviceRequestId: 'sr-1' })).toEqual([]);
  });

  it('Payment.AuthorizationFailed avisa o comprador', () => {
    const drafts = ruleFor('Payment.AuthorizationFailed').build({
      paymentId: 'pay-1',
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      failureCode: 'insufficient_funds',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      identityId: 'buyer-1',
      type: 'PAYMENT_AUTHORIZATION_FAILED',
      resourceType: 'MarketplaceOrder',
      resourceId: 'order-1',
    });
    expect(drafts[0]!.body.length).toBeGreaterThan(0);
  });

  it('PaymentIncrementalAuthorization.Approved avisa o comprador com o valor autorizado', () => {
    const drafts = ruleFor('PaymentIncrementalAuthorization.Approved').build({
      incrementalAuthorizationId: 'ia-1',
      paymentId: 'pay-1',
      changeOrderId: 'co-1',
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: 75,
      currency: 'BRL',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.identityId).toBe('buyer-1');
    expect(drafts[0]!.type).toBe('INCREMENTAL_PAYMENT_APPROVED');
    expect(drafts[0]!.body).toContain('75');
  });

  it('PaymentIncrementalAuthorization.Failed avisa o comprador', () => {
    const drafts = ruleFor('PaymentIncrementalAuthorization.Failed').build({
      incrementalAuthorizationId: 'ia-1',
      paymentId: 'pay-1',
      changeOrderId: 'co-1',
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: 50.13,
      currency: 'BRL',
      failureCode: 'insufficient_funds',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.identityId).toBe('buyer-1');
    expect(drafts[0]!.type).toBe('INCREMENTAL_PAYMENT_FAILED');
  });

  it('Funds.Released avisa o vendedor (a quem o dinheiro foi liberado), não o comprador', () => {
    const drafts = ruleFor('Funds.Released').build({
      trustCustodyId: 'custody-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: 150,
      currency: 'BRL',
      status: 'RELEASED',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.identityId).toBe('seller-1');
    expect(drafts[0]!.type).toBe('FUNDS_RELEASED');
    expect(drafts[0]!.body).toContain('150');
  });

  it('Funds.Released também cobre a tranche incremental (mesmo eventType, mesmo payload shape)', () => {
    // A tranche incremental reaproveita o MESMO eventType (docs/event-catalog.md,
    // IP-007) — a regra não precisa saber a diferença, só precisa de sellerId/amount.
    const drafts = ruleFor('Funds.Released').build({
      trustCustodyId: 'tranche-1',
      paymentId: 'pay-1',
      orderId: 'order-1',
      changeOrderId: 'co-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: 75,
      currency: 'BRL',
      status: 'RELEASED',
    });
    expect(drafts[0]!.identityId).toBe('seller-1');
  });

  it('Identity.PasswordChanged avisa o dono da conta', () => {
    const drafts = ruleFor('Identity.PasswordChanged').build({
      identityId: 'identity-1',
      changedAt: '2026-09-15T10:00:00Z',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      identityId: 'identity-1',
      type: 'PASSWORD_CHANGED',
      resourceType: 'Identity',
      resourceId: null,
    });
  });

  it('Identity.PasswordRecoveryRequested avisa o dono da conta', () => {
    const drafts = ruleFor('Identity.PasswordRecoveryRequested').build({
      identityId: 'identity-1',
      requestedAt: '2026-09-15T10:00:00Z',
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      identityId: 'identity-1',
      type: 'PASSWORD_RECOVERY_REQUESTED',
      resourceType: 'Identity',
      resourceId: null,
    });
  });

  it('todas as 7 regras novas declaram category TRANSACTIONAL (não há conteúdo opcional no MVP)', () => {
    const newEventTypes = [
      'ServiceRequestEngagement.Created',
      'Payment.AuthorizationFailed',
      'PaymentIncrementalAuthorization.Approved',
      'PaymentIncrementalAuthorization.Failed',
      'Funds.Released',
      'Identity.PasswordChanged',
      'Identity.PasswordRecoveryRequested',
    ];
    for (const eventType of newEventTypes) {
      expect(ruleFor(eventType).category).toBe('TRANSACTIONAL');
    }
  });

  it('não introduz nenhuma regra duplicada por eventType (consumerName único por evento)', () => {
    const consumerNames = NOTIFICATION_RULES.map((rule) => rule.consumerName);
    expect(new Set(consumerNames).size).toBe(consumerNames.length);
  });
});
