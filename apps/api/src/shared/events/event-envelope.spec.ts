import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { createEventEnvelope, eventEnvelopeSchema } from './event-envelope';

describe('createEventEnvelope', () => {
  const correlationId = uuidv7();

  it('gera envelope canônico validável pelo schema (DOC-005)', () => {
    const envelope = createEventEnvelope({
      eventName: 'Identity.Created',
      payload: { identityId: uuidv7() },
      producer: 'identity-service',
      correlationId,
    });

    expect(envelope.eventVersion).toBe('1.0');
    expect(() => eventEnvelopeSchema.parse(envelope)).not.toThrow();
    // occurredAt em UTC ISO 8601
    expect(envelope.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rejeita nome fora do padrão <Entity>.<Action>', () => {
    for (const bad of ['identity.created', 'IdentityCreated', 'Identity.Create.Now', 'IDN.CREATED']) {
      expect(() =>
        createEventEnvelope({
          eventName: bad,
          payload: {},
          producer: 'identity-service',
          correlationId,
        }),
      ).toThrow();
    }
  });

  it('propaga correlationId e causationId (cadeia de causalidade)', () => {
    const cause = createEventEnvelope({
      eventName: 'Verification.Approved',
      payload: {},
      producer: 'verification-service',
      correlationId,
    });
    const effect = createEventEnvelope({
      eventName: 'TrustScore.Calculated',
      payload: {},
      producer: 'trust-engine',
      correlationId: cause.correlationId,
      causationId: cause.eventId,
    });
    expect(effect.correlationId).toBe(correlationId);
    expect(effect.causationId).toBe(cause.eventId);
  });
});
