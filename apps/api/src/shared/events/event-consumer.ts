import { DatabaseExecutor } from '../database/database.module';
import { EventEnvelope } from './event-envelope';

/**
 * Contrato de consumer de eventos (DOC-005). Implementações são descobertas
 * automaticamente pelo OutboxRelayService no bootstrap e registradas no pg-boss.
 *
 * Garantias oferecidas pela plataforma ao `handle`:
 * - idempotência: cada (consumerName, eventId) é processado no máximo uma vez;
 * - transação: `handle` roda dentro de uma transação junto com o registro de
 *   dedupe — se lançar exceção, nada é persistido e o pg-boss reagenda o job.
 */
export abstract class EventConsumer {
  /** Nome do evento consumido — ex.: `Identity.Created`. */
  abstract readonly eventName: string;
  /** Identificador estável do consumer — ex.: `tps.create-trust-passport`. */
  abstract readonly consumerName: string;

  abstract handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void>;
}
