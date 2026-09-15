import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationController } from './infrastructure/api/notification.controller';
import { NOTIFICATION_CONSUMER_PROVIDERS } from './infrastructure/consumers/notification.consumers';
import { NotificationRepository } from './infrastructure/persistence/drizzle-notification.repository';

/**
 * Notificações in-app (NTF-001).
 *
 * O módulo é puramente **reativo**: não expõe nenhuma forma de criar aviso —
 * tudo nasce de evento de domínio consumido do outbox. Isso mantém os módulos
 * de negócio sem nenhuma dependência de notificação (eles só publicam fatos) e
 * garante idempotência de graça pelo dedupe do EventConsumer.
 *
 * Canais externos (e-mail, push) entram depois consumindo os mesmos eventos.
 *
 * IP-002 — importa `IdentityModule` só para ler `IdentityRepository` (resolver
 * o locale do destinatário antes de persistir o aviso); nenhuma regra de
 * negócio de Identity entra aqui.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationController],
  providers: [NotificationRepository, ...NOTIFICATION_CONSUMER_PROVIDERS],
  exports: [NotificationRepository],
})
export class NotificationModule {}
