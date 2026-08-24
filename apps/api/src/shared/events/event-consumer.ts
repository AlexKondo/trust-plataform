import { DatabaseExecutor } from '../database/database.module';
import { ConsumedEvent } from './event-envelope';

/**
 * Contrato de consumer de eventos (DOC-005 + PACK-00 v1.1 §10). Implementações
 * são descobertas automaticamente pelo OutboxRelayService no bootstrap e
 * registradas no pg-boss.
 *
 * Garantias oferecidas pela plataforma ao `handle`:
 * - idempotência: cada (consumerName, eventId) é processado no máximo uma vez;
 * - transação: `handle` roda dentro de uma transação junto com o registro de
 *   dedupe — se lançar exceção, nada é persistido e o pg-boss reagenda o job.
 *
 * O envelope recebido é `ConsumedEvent`: `aggregateType`/`aggregateId` podem vir
 * `undefined` em eventos históricos (pré-PACK-00) lidos pelo caminho tolerante.
 */
export abstract class EventConsumer {
  /** Evento consumido — campo canônico `eventType`, ex.: `Identity.Created`. */
  abstract readonly eventType: string;
  /** Identificador estável do consumer — ex.: `tps.create-trust-passport`. */
  abstract readonly consumerName: string;

  abstract handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void>;
}
