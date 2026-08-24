import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/**
 * Envelope canônico de eventos de domínio — PACK-00 v1.1 §5.
 *
 * `eventType` é o campo canônico de nome do evento para TODA escrita nova.
 * `aggregateType` + `aggregateId` identificam o agregado responsável pelo fato
 * e são obrigatórios (§5.2): sem eles não é possível correlacionar o histórico
 * de eventos por agregado.
 *
 * Eventos históricos gravados antes do PACK-00 não possuem esses campos e usam
 * `eventName`. Eles são lidos APENAS pelo caminho tolerante isolado em
 * `legacy-event-compat.ts` — nunca por este contrato.
 */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  /** `<Entity>.<Action>` em PascalCase, verbo no passado — ex.: `Identity.Created`. */
  eventType: string;
  /** Formato canônico "major.minor" (PACK-00 v1.1 §5). */
  eventVersion: string;
  /** UTC ISO 8601. */
  occurredAt: string;
  producer: string;
  /** Tipo do agregado responsável pelo fato — ex.: `Payment`. */
  aggregateType: string;
  /** Identificador do agregado responsável pelo fato. */
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

/**
 * Dois segmentos `Entity.Event` (PACK-00 v1.1 §5.1). O contexto delimitado é
 * representado pelo `producer`/propriedade de domínio, não por um terceiro segmento.
 */
export const EVENT_TYPE_PATTERN = /^[A-Z][a-z][A-Za-z]*\.[A-Z][a-z][A-Za-z]*$/;
export const EVENT_VERSION_PATTERN = /^\d+\.\d+$/;

/**
 * Validação ESTRITA — usada só para escrita nova (PACK-00 v1.1 §11).
 * Recusa envelope sem `aggregateType`/`aggregateId` ou com `eventName` legado.
 */
export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z
    .string()
    .regex(EVENT_TYPE_PATTERN, 'eventType deve ser `<Entity>.<Action>` em PascalCase'),
  eventVersion: z.string().regex(EVENT_VERSION_PATTERN, 'eventVersion deve ser "major.minor"'),
  occurredAt: z.string().datetime(),
  producer: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  correlationId: z.string().min(1),
  causationId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
});

/**
 * O que um consumer recebe. A identidade de agregado é opcional AQUI porque
 * eventos históricos (pré-PACK-00) não a possuem e o PACK-00 §11 proíbe
 * fabricá-la. Escritas novas sempre a preenchem — ver `createEventEnvelope`.
 */
export type ConsumedEvent<TPayload = Record<string, unknown>> = Omit<
  EventEnvelope<TPayload>,
  'aggregateType' | 'aggregateId'
> &
  Partial<Pick<EventEnvelope<TPayload>, 'aggregateType' | 'aggregateId'>>;

export interface CreateEventInput<TPayload> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
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
  if (!EVENT_TYPE_PATTERN.test(input.eventType)) {
    throw new Error(
      `Invalid event type "${input.eventType}" — expected \`<Entity>.<Action>\` in PascalCase.`,
    );
  }
  if (!input.aggregateType?.trim()) {
    throw new Error(`Event "${input.eventType}" is missing aggregateType (PACK-00 §5.2).`);
  }
  if (!input.aggregateId?.trim()) {
    throw new Error(`Event "${input.eventType}" is missing aggregateId (PACK-00 §5.2).`);
  }
  const eventVersion = input.eventVersion ?? '1.0';
  if (!EVENT_VERSION_PATTERN.test(eventVersion)) {
    throw new Error(`Invalid event version "${eventVersion}" — expected "major.minor".`);
  }
  return {
    eventId: uuidv7(),
    eventType: input.eventType,
    eventVersion,
    occurredAt: new Date().toISOString(),
    producer: input.producer,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    payload: input.payload,
  };
}
