import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/** Envelope canônico de eventos de domínio (DOC-005). */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  /** `<Entity>.<Action>` em PascalCase, verbo no passado — ex.: `Identity.Created`. */
  eventName: string;
  eventVersion: string;
  /** UTC ISO 8601. */
  occurredAt: string;
  producer: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export const EVENT_NAME_PATTERN = /^[A-Z][a-z][A-Za-z]*\.[A-Z][a-z][A-Za-z]*$/;

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z
    .string()
    .regex(EVENT_NAME_PATTERN, 'eventName deve ser `<Entity>.<Action>` em PascalCase'),
  eventVersion: z.string().regex(/^\d+\.\d+$/),
  occurredAt: z.string().datetime(),
  producer: z.string().min(1),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
});

export interface CreateEventInput<TPayload> {
  eventName: string;
  payload: TPayload;
  producer: string;
  correlationId: string;
  /** eventId do evento que causou este (cadeia de causalidade). */
  causationId?: string;
  eventVersion?: string;
}

export function createEventEnvelope<TPayload extends Record<string, unknown>>(
  input: CreateEventInput<TPayload>,
): EventEnvelope<TPayload> {
  if (!EVENT_NAME_PATTERN.test(input.eventName)) {
    throw new Error(
      `Invalid event name "${input.eventName}" — expected \`<Entity>.<Action>\` in PascalCase.`,
    );
  }
  return {
    eventId: uuidv7(),
    eventName: input.eventName,
    eventVersion: input.eventVersion ?? '1.0',
    occurredAt: new Date().toISOString(),
    producer: input.producer,
    correlationId: input.correlationId,
    causationId: input.causationId,
    payload: input.payload,
  };
}
