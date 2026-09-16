import { describe, expect, it } from 'vitest';
import { UnverifiedAsaasWebhookSignatureVerifier } from './unverified-asaas-webhook-signature.verifier';

describe('UnverifiedAsaasWebhookSignatureVerifier', () => {
  it('é fail-closed: rejeita mesmo um payload/headers "plausíveis"', () => {
    const verifier = new UnverifiedAsaasWebhookSignatureVerifier();

    const result = verifier.verify(JSON.stringify({ event: 'PAYMENT_CONFIRMED' }), {
      'asaas-access-token': 'looks-plausible-but-unconfirmed',
    });

    expect(result).toBe(false);
  });

  it('é fail-closed mesmo sem nenhum header', () => {
    const verifier = new UnverifiedAsaasWebhookSignatureVerifier();
    expect(verifier.verify('{}', {})).toBe(false);
  });
});
