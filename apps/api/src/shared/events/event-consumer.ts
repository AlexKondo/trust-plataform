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

  /**
   * PACK-01 §17 — consumers que chamam dependência EXTERNA (um gateway de
   * pagamento, por exemplo) não podem rodar com transação aberta: seria uma
   * conexão de banco presa esperando HTTP e, pior, uma transação passível de
   * rollback DEPOIS de o provedor já ter movido dinheiro.
   *
   * Quando `true`, o relay chama `handle` FORA de transação e grava o registro
   * de dedupe só após o sucesso. A garantia passa de "exatamente uma vez pelo
   * dedupe" para "ao menos uma vez + handler idempotente" — que é o que o
   * PACK-00 §5.3 já exige de todo consumer.
   *
   * Use apenas quando o handler for comprovadamente idempotente.
   */
  readonly managesOwnTransaction: boolean = false;

  abstract handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void>;
}
