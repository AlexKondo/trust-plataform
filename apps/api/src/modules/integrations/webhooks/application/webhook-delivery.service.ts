import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import {
  WebhookAllowedEventType,
  sanitizeWebhookPayload,
} from '../domain/webhook-event-allowlist';
import { WebhookSignatureService } from '../domain/webhook-signature.service';
import { WebhookSubscriptionRepository } from '../infrastructure/persistence/drizzle-webhook.repository';
import { WebhookSubscriptionRow } from '../infrastructure/persistence/webhook-subscriptions.schema';
import {
  WEBHOOK_HTTP_TIMEOUT_MS,
  WEBHOOK_MAX_DELIVERY_ATTEMPTS,
  WEBHOOK_PAYLOAD_VERSION,
} from './webhook-delivery.constants';

/**
 * Envelope enviado ao parceiro — versão própria e DISTINTA do envelope
 * interno PACK-00 (§"Signed delivery" do IP-023): `payloadVersion`,
 * `deliveryAttempt` e `data` (já sanitizado pela allowlist) são específicos
 * de webhook OUTBOUND, nunca vazam campos internos (`producer`,
 * `causationId`, etc.) que não fazem sentido para um terceiro.
 */
interface WebhookEnvelope {
  payloadVersion: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  deliveryAttempt: number;
  data: Record<string, unknown>;
}

/**
 * IP-023 — entrega HTTP assinada para UMA assinatura. Não decide retry (isso
 * é responsabilidade do consumer/outbox); só executa uma tentativa e reporta
 * sucesso/falha.
 */
@Injectable()
export class WebhookDeliveryService {
  constructor(
    private readonly repository: WebhookSubscriptionRepository,
    private readonly signature: WebhookSignatureService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebhookDeliveryService.name);
  }

  /**
   * Entrega para todas as assinaturas ativas do eventType, pulando as que já
   * têm entrega `SUCCESS`/`DEAD_LETTER` registrada para este `eventId`
   * (idempotência de retry — reentrega do outbox não duplica POST).
   * Retorna `true` se TODAS as assinaturas elegíveis terminaram (sucesso ou
   * DLQ) — o consumer usa isso para decidir se a linha do outbox pode ser
   * dada como concluída.
   */
  async deliverToSubscribers(
    eventType: WebhookAllowedEventType,
    envelope: ConsumedEvent,
    tx: DatabaseExecutor,
  ): Promise<boolean> {
    const subscriptions = await this.repository.findActiveBySubscribedEventType(eventType);
    if (subscriptions.length === 0) {
      return true;
    }

    let allDone = true;
    for (const subscription of subscriptions) {
      const done = await this.deliverToOne(subscription, eventType, envelope, tx);
      if (!done) {
        allDone = false;
      }
    }
    return allDone;
  }

  /** Retorna `true` quando a entrega desta assinatura chegou a estado terminal (SUCCESS ou DEAD_LETTER). */
  private async deliverToOne(
    subscription: WebhookSubscriptionRow,
    eventType: WebhookAllowedEventType,
    envelope: ConsumedEvent,
    tx: DatabaseExecutor,
  ): Promise<boolean> {
    const delivery = await this.repository.createPendingDelivery(
      subscription.id,
      envelope.eventId,
      eventType,
      WEBHOOK_PAYLOAD_VERSION,
      tx,
    );
    if (delivery.status === 'SUCCESS' || delivery.status === 'DEAD_LETTER') {
      return true;
    }

    const attemptNumber = delivery.attempts + 1;
    const body: WebhookEnvelope = {
      payloadVersion: WEBHOOK_PAYLOAD_VERSION,
      eventId: envelope.eventId,
      eventType,
      occurredAt: envelope.occurredAt,
      deliveryAttempt: attemptNumber,
      data: sanitizeWebhookPayload(eventType, envelope.payload),
    };
    const rawBody = JSON.stringify(body);
    const signatureHex = this.signature.sign(rawBody, subscription.secretActive);

    try {
      const response = await this.postWithTimeout(subscription.url, rawBody, signatureHex);
      if (response.ok) {
        await this.repository.recordAttemptResult(
          delivery.id,
          { success: true, responseStatus: response.status, deadLetter: false },
          tx,
        );
        this.logger.info(
          {
            operation: 'WebhookDelivered',
            subscriptionId: subscription.id,
            eventId: envelope.eventId,
            eventType,
            attempt: attemptNumber,
            responseStatus: response.status,
            result: 'SUCCESS',
          },
          'Webhook delivered.',
        );
        return true;
      }
      return this.recordFailure(delivery.id, subscription.id, envelope.eventId, eventType, attemptNumber, tx, {
        responseStatus: response.status,
        error: `Non-2xx response: ${response.status}`,
      });
    } catch (error) {
      return this.recordFailure(delivery.id, subscription.id, envelope.eventId, eventType, attemptNumber, tx, {
        error: error instanceof Error ? error.message : 'Unknown delivery error',
      });
    }
  }

  private async recordFailure(
    deliveryId: string,
    subscriptionId: string,
    eventId: string,
    eventType: string,
    attemptNumber: number,
    tx: DatabaseExecutor,
    details: { responseStatus?: number; error: string },
  ): Promise<boolean> {
    const deadLetter = attemptNumber >= WEBHOOK_MAX_DELIVERY_ATTEMPTS;
    await this.repository.recordAttemptResult(
      deliveryId,
      { success: false, deadLetter, responseStatus: details.responseStatus, error: details.error },
      tx,
    );
    this.logger.error(
      {
        operation: 'WebhookDelivered',
        subscriptionId,
        eventId,
        eventType,
        attempt: attemptNumber,
        responseStatus: details.responseStatus,
        result: deadLetter ? 'DEAD_LETTER' : 'FAILURE',
      },
      deadLetter
        ? 'Webhook delivery moved to DLQ after max attempts.'
        : 'Webhook delivery failed; will retry.',
    );
    return deadLetter;
  }

  private async postWithTimeout(url: string, rawBody: string, signatureHex: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_HTTP_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trust-Webhook-Signature': signatureHex,
        },
        body: rawBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
