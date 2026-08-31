import { Injectable } from '@nestjs/common';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { ReleaseFundsUseCase } from '../../application/usecases/release-funds.usecase';

/**
 * PAY-004 fase 2 — executa a liberação no provedor (PACK-01 §11.1 passos 6-9).
 *
 * Roda a partir de `Funds.ReadyForRelease`, ou seja, **depois** de a decisão da
 * política já estar comitada. `managesOwnTransaction` garante o que o §17 exige:
 * a chamada ao gateway não acontece com transação aberta — com um provedor real
 * (Asaas) isso prenderia uma conexão por segundos e permitiria o pior cenário
 * de todos, o rollback do banco depois de o dinheiro já ter se movido.
 *
 * É seguro rodar sem o dedupe transacional porque `finalize` é idempotente por
 * desenho: chave determinística `release:{custodyId}` no provedor e checagem do
 * estado RELEASED, que é terminal.
 */
@Injectable()
export class FinalizeReleaseConsumer extends EventConsumer {
  readonly eventType = 'Funds.ReadyForRelease';
  readonly consumerName = 'pay.finalize-release';
  override readonly managesOwnTransaction = true;

  constructor(private readonly releaseFunds: ReleaseFundsUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent): Promise<void> {
    const payload = envelope.payload as { trustCustodyId?: string };
    const custodyId = envelope.aggregateId ?? payload.trustCustodyId;
    if (!custodyId) {
      return;
    }

    await this.releaseFunds.finalize(custodyId, envelope.correlationId);
  }
}
