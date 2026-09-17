import { describe, expect, it } from 'vitest';
import { WebhookSignatureService } from './webhook-signature.service';

describe('WebhookSignatureService', () => {
  const service = new WebhookSignatureService();

  it('produces a deterministic hex HMAC-SHA256 signature for a given body/secret', () => {
    const signature = service.sign('{"a":1}', 'secret123');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(service.sign('{"a":1}', 'secret123')).toBe(signature);
  });

  it('produces a different signature for a different secret', () => {
    const a = service.sign('{"a":1}', 'secret-a');
    const b = service.sign('{"a":1}', 'secret-b');
    expect(a).not.toBe(b);
  });

  it('verify() accepts the correct signature', () => {
    const body = '{"eventId":"abc"}';
    const secret = 'top-secret';
    const signature = service.sign(body, secret);
    expect(service.verify(body, secret, signature)).toBe(true);
  });

  it('verify() rejects a tampered body', () => {
    const secret = 'top-secret';
    const signature = service.sign('{"eventId":"abc"}', secret);
    expect(service.verify('{"eventId":"xyz"}', secret, signature)).toBe(false);
  });

  it('verify() rejects a signature signed with a different secret', () => {
    const body = '{"eventId":"abc"}';
    const wrongSignature = service.sign(body, 'wrong-secret');
    expect(service.verify(body, 'top-secret', wrongSignature)).toBe(false);
  });

  it('verify() rejects a malformed signature without throwing', () => {
    expect(service.verify('{}', 'secret', 'not-hex')).toBe(false);
  });
});
