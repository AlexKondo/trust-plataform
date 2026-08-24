import { z } from 'zod';
import { ConsumedEvent, EVENT_TYPE_PATTERN } from './event-envelope';

/**
 * ============================================================================
 * CAMADA DE COMPATIBILIDADE TEMPORÁRIA — PACK-00 v1.1 §11
 * ============================================================================
 * Só existe para LER eventos gravados antes do PACK-00, que:
 *   - nomeiam o evento em `eventName` (hoje o canônico é `eventType`); e/ou
 *   - não possuem `aggregateType`/`aggregateId` (o Pack proíbe fabricá-los).
 *
 * Duas origens reais de evento legado:
 *   1. linhas `outbox_events` ainda PENDING/FAILED na hora do deploy;
 *   2. jobs já enfileirados no pg-boss, cujo payload é o envelope antigo.
 *
 * ESTE MÓDULO NUNCA VALIDA ESCRITA NOVA. Escrita passa por
 * `createEventEnvelope`/`eventEnvelopeSchema`, que são estritos.
 *
 * REMOÇÃO: apagar este arquivo (e seus usos no OutboxRelayService) quando não
 * houver mais linhas de outbox anteriores à migration 0024 em estado PENDING
 * ou FAILED, e a fila do pg-boss tiver drenado.
 * ============================================================================
 */

const legacyEnvelopeSchema = z
  .object({
    eventId: z.string().min(1),
    /** Canônico a partir do PACK-00. */
    eventType: z.string().regex(EVENT_TYPE_PATTERN).optional(),
    /** LEGADO: nome do evento antes do PACK-00. */
    eventName: z.string().regex(EVENT_TYPE_PATTERN).optional(),
    eventVersion: z.string().optional(),
    occurredAt: z.string().min(1),
    producer: z.string().min(1),
    /** Ausentes em eventos históricos — não são fabricados. */
    aggregateType: z.string().min(1).optional(),
    aggregateId: z.string().min(1).optional(),
    correlationId: z.string().min(1),
    causationId: z.string().optional(),
    payload: z.record(z.unknown()),
  })
  .refine((value) => Boolean(value.eventType ?? value.eventName), {
    message: 'evento sem eventType nem eventName legado',
  });

export type LegacyEventEnvelope = z.infer<typeof legacyEnvelopeSchema>;

/** Um evento é legado quando não traz o nome canônico ou a identidade do agregado. */
export function isLegacyEvent(raw: LegacyEventEnvelope): boolean {
  return !raw.eventType || !raw.aggregateType || !raw.aggregateId;
}

/**
 * Normaliza um evento persistido (novo OU legado) para o formato que o consumer
 * recebe. `aggregateType`/`aggregateId` ficam `undefined` quando o evento é
 * histórico — o consumer não pode contar com eles para eventos antigos.
 */
export function readPersistedEvent(raw: unknown): ConsumedEvent {
  const parsed = legacyEnvelopeSchema.parse(raw);
  return {
    eventId: parsed.eventId,
    eventType: (parsed.eventType ?? parsed.eventName)!,
    eventVersion: parsed.eventVersion ?? '1.0',
    occurredAt: parsed.occurredAt,
    producer: parsed.producer,
    aggregateType: parsed.aggregateType,
    aggregateId: parsed.aggregateId,
    correlationId: parsed.correlationId,
    causationId: parsed.causationId,
    payload: parsed.payload,
  };
}
