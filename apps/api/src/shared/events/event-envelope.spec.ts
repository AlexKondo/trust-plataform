import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { createEventEnvelope, eventEnvelopeSchema } from './event-envelope';
import { isLegacyEvent, readPersistedEvent } from './legacy-event-compat';

describe('createEventEnvelope (PACK-00 v1.1 §5 — escrita estrita)', () => {
  const correlationId = uuidv7();
  const base = {
    payload: { identityId: uuidv7() },
    producer: 'identity-service',
    correlationId,
  };

  it('gera envelope canônico validável pelo schema estrito', () => {
    const aggregateId = uuidv7();
    const envelope = createEventEnvelope({
      ...base,
      eventType: 'Identity.Created',
      aggregateType: 'Identity',
      aggregateId,
    });

    expect(envelope.eventType).toBe('Identity.Created');
    expect(envelope.aggregateType).toBe('Identity');
    expect(envelope.aggregateId).toBe(aggregateId);
    expect(envelope.eventVersion).toBe('1.0');
    expect(() => eventEnvelopeSchema.parse(envelope)).not.toThrow();
    // occurredAt em UTC ISO 8601
    expect(envelope.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('`eventType` é o campo canônico de escrita — `eventName` não existe no envelope', () => {
    const envelope = createEventEnvelope({
      ...base,
      eventType: 'Identity.Created',
      aggregateType: 'Identity',
      aggregateId: uuidv7(),
    });

    expect(Object.keys(envelope)).toContain('eventType');
    expect(Object.keys(envelope)).not.toContain('eventName');
    // o schema estrito também recusa o campo legado no lugar do canônico
    const legacyShaped = { ...envelope, eventName: envelope.eventType } as Record<string, unknown>;
    delete legacyShaped.eventType;
    expect(() => eventEnvelopeSchema.parse(legacyShaped)).toThrow();
  });

  it('recusa escrita nova sem aggregateType ou aggregateId', () => {
    expect(() =>
      createEventEnvelope({
        ...base,
        eventType: 'Identity.Created',
        aggregateType: '',
        aggregateId: uuidv7(),
      }),
    ).toThrow(/aggregateType/);

    expect(() =>
      createEventEnvelope({
        ...base,
        eventType: 'Identity.Created',
        aggregateType: 'Identity',
        aggregateId: '   ',
      }),
    ).toThrow(/aggregateId/);

    const complete = createEventEnvelope({
      ...base,
      eventType: 'Identity.Created',
      aggregateType: 'Identity',
      aggregateId: uuidv7(),
    });
    for (const missing of ['aggregateType', 'aggregateId'] as const) {
      const incomplete: Record<string, unknown> = { ...complete };
      delete incomplete[missing];
      expect(() => eventEnvelopeSchema.parse(incomplete)).toThrow();
    }
  });

  it('rejeita nome fora do padrão <Entity>.<Action> (dois segmentos, §5.1)', () => {
    const bad = [
      'identity.created',
      'IdentityCreated',
      'Identity.Create.Now',
      'IDN.CREATED',
      // três segmentos com contexto delimitado NÃO são canônicos no PACK-00
      'Identity.Identity.Created',
    ];
    for (const eventType of bad) {
      expect(() =>
        createEventEnvelope({
          ...base,
          eventType,
          aggregateType: 'Identity',
          aggregateId: uuidv7(),
        }),
      ).toThrow();
    }
  });

  it('exige eventVersion no formato "major.minor"', () => {
    expect(() =>
      createEventEnvelope({
        ...base,
        eventType: 'Identity.Created',
        aggregateType: 'Identity',
        aggregateId: uuidv7(),
        eventVersion: '1',
      }),
    ).toThrow(/major\.minor/);
  });

  it('propaga correlationId e causationId (cadeia de causalidade)', () => {
    const cause = createEventEnvelope({
      eventType: 'Verification.Approved',
      aggregateType: 'Verification',
      aggregateId: uuidv7(),
      payload: {},
      producer: 'verification-service',
      correlationId,
    });
    const effect = createEventEnvelope({
      eventType: 'TrustScore.Calculated',
      aggregateType: 'TrustScore',
      aggregateId: uuidv7(),
      payload: {},
      producer: 'trust-engine',
      correlationId: cause.correlationId,
      causationId: cause.eventId,
    });
    expect(effect.correlationId).toBe(correlationId);
    expect(effect.causationId).toBe(cause.eventId);
  });
});

describe('leitura tolerante de eventos históricos (PACK-00 v1.1 §11)', () => {
  const historic = {
    eventId: uuidv7(),
    // gravado antes do PACK-00: nome no campo legado, sem identidade de agregado
    eventName: 'Identity.Created',
    eventVersion: '1.0',
    occurredAt: new Date().toISOString(),
    producer: 'identity-service',
    correlationId: uuidv7(),
    payload: { identityId: uuidv7() },
  };

  it('lê evento legado com eventName e sem agregado, sem fabricar valores', () => {
    const event = readPersistedEvent(historic);

    expect(event.eventType).toBe('Identity.Created');
    expect(event.aggregateType).toBeUndefined();
    expect(event.aggregateId).toBeUndefined();
    expect(event.payload).toEqual(historic.payload);
    expect(isLegacyEvent(historic)).toBe(true);
  });

  it('lê evento canônico pelo mesmo caminho, preservando o agregado', () => {
    const aggregateId = uuidv7();
    const canonical = createEventEnvelope({
      eventType: 'Payment.Authorized',
      aggregateType: 'Payment',
      aggregateId,
      payload: { paymentId: aggregateId },
      producer: 'payment-service',
      correlationId: uuidv7(),
    });

    const event = readPersistedEvent(canonical);
    expect(event.aggregateType).toBe('Payment');
    expect(event.aggregateId).toBe(aggregateId);
    expect(isLegacyEvent(canonical)).toBe(false);
  });

  it('a tolerância NÃO vale para escrita nova: o schema estrito recusa o mesmo evento', () => {
    expect(() => eventEnvelopeSchema.parse(historic)).toThrow();
    expect(() => eventEnvelopeSchema.parse(readPersistedEvent(historic))).toThrow();
  });
});
