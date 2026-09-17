import { Provider } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../../shared/database/database.module';
import { EventConsumer } from '../../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../../shared/events/event-envelope';
import { WebhookDeliveryService } from '../../application/webhook-delivery.service';
import { WEBHOOK_ALLOWED_EVENT_TYPES, WebhookAllowedEventType } from '../../domain/webhook-event-allowlist';

/**
 * Um consumer por eventType da allowlist (mesmo padrão de fábrica de
 * `NOTIFICATION_CONSUMER_PROVIDERS`/IP-013 — evita N arquivos quase
 * idênticos). `managesOwnTransaction: true` porque `handle` chama uma
 * dependência EXTERNA (o endpoint do parceiro) — mesma justificativa de
 * `pay.finalize-release` (PACK-01 §17): não segurar uma conexão de
 * transação presa esperando um HTTP de terceiro.
 *
 * Semântica de retry: se `deliverToSubscribers` devolve `false` (alguma
 * assinatura ainda não chegou a um estado terminal), este `handle` LANÇA —
 * a linha do outbox permanece PENDING e será reentregue na próxima
 * `drainOnce()` (cron a cada 5min), até `outboxMaxAttempts`. Isto é
 * INDEPENDENTE do limite por-assinatura `WEBHOOK_MAX_DELIVERY_ATTEMPTS`: uma
 * assinatura pode já estar `DEAD_LETTER` (parou de tentar, visível no admin)
 * enquanto outra assinatura do mesmo evento ainda está `PENDING` e continua
 * sendo reentregue — `deliverToOne` já pula quem chegou a estado terminal.
 */
class WebhookDeliveryConsumer extends EventConsumer {
  readonly eventType: string;
  readonly consumerName: string;
  override readonly managesOwnTransaction = true;

  constructor(
    eventType: WebhookAllowedEventType,
    private readonly delivery: WebhookDeliveryService,
  ) {
    super();
    this.eventType = eventType;
    this.consumerName = `webhooks.deliver.${eventType}`;
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const allDone = await this.delivery.deliverToSubscribers(
      this.eventType as WebhookAllowedEventType,
      envelope,
      tx,
    );
    if (!allDone) {
      throw new Error(
        `Webhook delivery incomplete for eventType=${this.eventType} eventId=${envelope.eventId}; will retry.`,
      );
    }
  }
}

export const WEBHOOK_CONSUMER_PROVIDERS: Provider[] = WEBHOOK_ALLOWED_EVENT_TYPES.map((eventType) => ({
  provide: `WebhookDeliveryConsumer:${eventType}`,
  inject: [WebhookDeliveryService],
  useFactory: (delivery: WebhookDeliveryService) => new WebhookDeliveryConsumer(eventType, delivery),
}));
