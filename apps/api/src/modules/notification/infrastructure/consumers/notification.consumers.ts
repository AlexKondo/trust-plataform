import { Provider } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { DEFAULT_LOCALE } from '../../../../shared/i18n/locale';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { NOTIFICATION_RULES, NotificationRule } from '../../domain/notification-rules';
import { NotificationRepository } from '../persistence/drizzle-notification.repository';

/**
 * Consumer genérico: aplica uma `NotificationRule` ao payload e persiste os
 * avisos. A idempotência é do próprio EventConsumer (dedupe por
 * consumerName+eventId), então um evento reprocessado não duplica notificação.
 *
 * IP-002 — antes de persistir, resolve o locale de CADA destinatário
 * (preferência salva em `identities.preferred_locale` → PT-BR default) e grava
 * junto do aviso. O texto do título/corpo continua vindo só em PT-BR da regra
 * (catálogo NTF-001 pré-existente, fora do escopo desta fundação — IP-002 §4);
 * o que fica pronto aqui é o MECANISMO de resolução por destinatário, para uma
 * regra futura poder renderizar por locale sem alterar este consumer.
 */
class RuleNotificationConsumer extends EventConsumer {
  readonly eventType: string;
  readonly consumerName: string;

  constructor(
    private readonly rule: NotificationRule,
    private readonly repository: NotificationRepository,
    private readonly identityRepository: IdentityRepository,
  ) {
    super();
    this.eventType = rule.eventType;
    this.consumerName = rule.consumerName;
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const drafts = this.rule.build(envelope.payload);
    const localized = await Promise.all(
      drafts.map(async (draft) => ({
        ...draft,
        locale: await this.resolveRecipientLocale(draft.identityId, tx),
      })),
    );
    await this.repository.createMany(localized, tx);
  }

  /**
   * Destinatário sem Identity resolvível (não deveria acontecer) → default
   * seguro. IMPORTANTE: passa `tx` adiante — `handle` já roda dentro da
   * transação do relay (uma conexão do pool reservada); pedir uma conexão
   * NOVA aqui (pool de teste tem `max: 4`) esgota o pool sob jobs concorrentes
   * e trava a suíte inteira em timeout (ver doc do `IdentityRepository`).
   */
  private async resolveRecipientLocale(identityId: string, tx: DatabaseExecutor): Promise<string> {
    const recipient = await this.identityRepository.findById(identityId, tx);
    return recipient?.preferredLocale ?? DEFAULT_LOCALE;
  }
}

/**
 * Um provider por regra. São classes de verdade (o OutboxRelayService descobre
 * consumers por `instanceof EventConsumer`), mas construídas a partir da tabela
 * de regras — o que evita 17 arquivos praticamente idênticos.
 */
export const NOTIFICATION_CONSUMER_PROVIDERS: Provider[] = NOTIFICATION_RULES.map((rule) => ({
  provide: `NotificationConsumer:${rule.consumerName}`,
  inject: [NotificationRepository, IdentityRepository],
  useFactory: (repository: NotificationRepository, identityRepository: IdentityRepository) =>
    new RuleNotificationConsumer(rule, repository, identityRepository),
}));
