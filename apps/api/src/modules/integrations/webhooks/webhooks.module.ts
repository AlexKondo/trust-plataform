import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { AdminWebhookController } from './infrastructure/api/admin-webhook.controller';
import { WEBHOOK_CONSUMER_PROVIDERS } from './infrastructure/consumers/webhook-delivery.consumers';
import { WebhookSubscriptionRepository } from './infrastructure/persistence/drizzle-webhook.repository';
import { WebhookDeliveryService } from './application/webhook-delivery.service';
import { WebhookSubscriptionService } from './application/webhook-subscription.service';
import { WebhookSignatureService } from './domain/webhook-signature.service';

/**
 * IP-023 — External Integrations & Webhooks (fundação OUTBOUND). Não deve
 * ser confundido com o webhook INBOUND do IP-009 (`AsaasWebhookController`,
 * módulo `payment`) — direções opostas, portas diferentes, sem
 * sobreposição de arquivos.
 *
 * `IdentityModule` só é importado por `AdminGuard` (mesmo padrão de
 * `SafetyModule`/IP-014).
 */
@Module({
  imports: [IdentityModule],
  controllers: [AdminWebhookController],
  providers: [
    WebhookSubscriptionRepository,
    WebhookSignatureService,
    WebhookDeliveryService,
    WebhookSubscriptionService,
    ...WEBHOOK_CONSUMER_PROVIDERS,
  ],
  exports: [WebhookSubscriptionService],
})
export class WebhooksModule {}
