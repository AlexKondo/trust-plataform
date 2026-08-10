import { Provider } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { NOTIFICATION_RULES, NotificationRule } from '../../domain/notification-rules';
import { NotificationRepository } from '../persistence/drizzle-notification.repository';

/**
 * Consumer genérico: aplica uma `NotificationRule` ao payload e persiste os
 * avisos. A idempotência é do próprio EventConsumer (dedupe por
 * consumerName+eventId), então um evento reprocessado não duplica notificação.
 */
class RuleNotificationConsumer extends EventConsumer {
  readonly eventName: string;
  readonly consumerName: string;

  constructor(
    private readonly rule: NotificationRule,
    private readonly repository: NotificationRepository,
  ) {
    super();
    this.eventName = rule.eventName;
    this.consumerName = rule.consumerName;
  }

  async handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const drafts = this.rule.build(envelope.payload);
    await this.repository.createMany(drafts, tx);
  }
}

/**
 * Um provider por regra. São classes de verdade (o OutboxRelayService descobre
 * consumers por `instanceof EventConsumer`), mas construídas a partir da tabela
 * de regras — o que evita 17 arquivos praticamente idênticos.
 */
export const NOTIFICATION_CONSUMER_PROVIDERS: Provider[] = NOTIFICATION_RULES.map((rule) => ({
  provide: `NotificationConsumer:${rule.consumerName}`,
  inject: [NotificationRepository],
  useFactory: (repository: NotificationRepository) =>
    new RuleNotificationConsumer(rule, repository),
}));
