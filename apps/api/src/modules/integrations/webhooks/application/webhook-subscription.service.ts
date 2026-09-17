import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { WebhookSubscriptionRepository } from '../infrastructure/persistence/drizzle-webhook.repository';
import { WebhookSubscriptionRow } from '../infrastructure/persistence/webhook-subscriptions.schema';
import { isAllowedWebhookEventType, WEBHOOK_ALLOWED_EVENT_TYPES } from '../domain/webhook-event-allowlist';
import { generateWebhookSecret } from './webhook-secret.util';

/** View pública — nunca inclui `secretActive`/`secretPrevious`. */
export type WebhookSubscriptionView = Omit<
  WebhookSubscriptionRow,
  'secretActive' | 'secretPrevious'
>;

function toView(row: WebhookSubscriptionRow): WebhookSubscriptionView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secretActive, secretPrevious, ...view } = row;
  return view;
}

/**
 * IP-023 — CRUD administrativo de assinaturas de webhook. Todo endpoint que
 * chama este serviço já passou por `AdminGuard` (mesmo padrão de
 * `RiskFlagController`/IP-014, `LedgerAdminController`/IP-010).
 */
@Injectable()
export class WebhookSubscriptionService {
  constructor(
    private readonly repository: WebhookSubscriptionRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  private validateEventTypes(eventTypes: string[]): void {
    if (eventTypes.length === 0) {
      throw new BadRequestException({
        code: 'WEBHOOK_EVENT_TYPES_REQUIRED',
        message: 'At least one event type must be subscribed.',
      });
    }
    const invalid = eventTypes.filter((type) => !isAllowedWebhookEventType(type));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'WEBHOOK_EVENT_TYPE_NOT_ALLOWED',
        message: `Event type(s) not in allowlist: ${invalid.join(', ')}. Allowed: ${WEBHOOK_ALLOWED_EVENT_TYPES.join(', ')}`,
      });
    }
  }

  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException({ code: 'WEBHOOK_URL_INVALID', message: 'url must be a valid URL.' });
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException({
        code: 'WEBHOOK_URL_MUST_BE_HTTPS',
        message: 'Webhook URL must use https:// (signed payloads over an unencrypted channel are unsafe).',
      });
    }
  }

  /** Segredo em texto plano devolvido só aqui, uma única vez. */
  async create(
    adminIdentityId: string,
    input: { url: string; eventTypes: string[]; description?: string },
    context: { ipAddress?: string; correlationId?: string },
  ): Promise<{ subscription: WebhookSubscriptionView; secret: string }> {
    this.validateUrl(input.url);
    this.validateEventTypes(input.eventTypes);
    const secret = generateWebhookSecret();
    const row = await this.repository.create({
      url: input.url,
      description: input.description,
      eventTypes: input.eventTypes,
      secretActive: secret,
      secretPrevious: null,
      secretRotatedAt: null,
      active: true,
      createdBy: adminIdentityId,
    });
    await this.auditLog.record({
      operation: 'WEBHOOK_SUBSCRIPTION_CREATED',
      identityId: adminIdentityId,
      resource: 'WebhookSubscription',
      result: 'SUCCESS',
      resourceId: row.id,
      metadata: { url: input.url, eventTypes: input.eventTypes },
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
    return { subscription: toView(row), secret };
  }

  async list(onlyActive: boolean): Promise<WebhookSubscriptionView[]> {
    const rows = await this.repository.list(onlyActive);
    return rows.map(toView);
  }

  async get(id: string): Promise<WebhookSubscriptionView> {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new NotFoundException({ code: 'WEBHOOK_SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' });
    }
    return toView(row);
  }

  async update(
    id: string,
    adminIdentityId: string,
    fields: { url?: string; eventTypes?: string[]; description?: string },
    context: { ipAddress?: string; correlationId?: string },
  ): Promise<WebhookSubscriptionView> {
    if (fields.url) this.validateUrl(fields.url);
    if (fields.eventTypes) this.validateEventTypes(fields.eventTypes);
    const row = await this.repository.updateUrlAndEvents(id, fields);
    if (!row) {
      throw new NotFoundException({ code: 'WEBHOOK_SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' });
    }
    await this.auditLog.record({
      operation: 'WEBHOOK_SUBSCRIPTION_UPDATED',
      identityId: adminIdentityId,
      resource: 'WebhookSubscription',
      result: 'SUCCESS',
      resourceId: id,
      metadata: fields,
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
    return toView(row);
  }

  async setActive(
    id: string,
    active: boolean,
    adminIdentityId: string,
    context: { ipAddress?: string; correlationId?: string },
  ): Promise<WebhookSubscriptionView> {
    const row = await this.repository.setActive(id, active);
    if (!row) {
      throw new NotFoundException({ code: 'WEBHOOK_SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' });
    }
    await this.auditLog.record({
      operation: active ? 'WEBHOOK_SUBSCRIPTION_ENABLED' : 'WEBHOOK_SUBSCRIPTION_DISABLED',
      identityId: adminIdentityId,
      resource: 'WebhookSubscription',
      result: 'SUCCESS',
      resourceId: id,
      metadata: {},
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
    return toView(row);
  }

  /**
   * Modelo de rotação de dois segredos: gera um novo `secretActive`; o
   * anterior desloca para `secretPrevious` e continua PRESERVADO (não é mais
   * usado para assinar, mas fica disponível para ferramentas de verificação
   * durante a janela de rotação) até `confirmRotation` ser chamado.
   */
  async rotateSecret(
    id: string,
    adminIdentityId: string,
    context: { ipAddress?: string; correlationId?: string },
  ): Promise<{ subscription: WebhookSubscriptionView; secret: string }> {
    const secret = generateWebhookSecret();
    const row = await this.repository.rotateSecret(id, secret);
    if (!row) {
      throw new NotFoundException({ code: 'WEBHOOK_SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' });
    }
    await this.auditLog.record({
      operation: 'WEBHOOK_SUBSCRIPTION_SECRET_ROTATED',
      identityId: adminIdentityId,
      resource: 'WebhookSubscription',
      result: 'SUCCESS',
      resourceId: id,
      metadata: {},
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
    return { subscription: toView(row), secret };
  }

  /** Admin confirma que o parceiro já migrou — descarta o segredo anterior. */
  async confirmRotation(
    id: string,
    adminIdentityId: string,
    context: { ipAddress?: string; correlationId?: string },
  ): Promise<WebhookSubscriptionView> {
    const row = await this.repository.clearPreviousSecret(id);
    if (!row) {
      throw new NotFoundException({ code: 'WEBHOOK_SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' });
    }
    await this.auditLog.record({
      operation: 'WEBHOOK_SUBSCRIPTION_ROTATION_CONFIRMED',
      identityId: adminIdentityId,
      resource: 'WebhookSubscription',
      result: 'SUCCESS',
      resourceId: id,
      metadata: {},
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
    });
    return toView(row);
  }

  async deliveryHealth(id: string) {
    await this.get(id);
    return this.repository.deliveryHealth(id);
  }

  async listDeliveries(filter: { subscriptionId?: string; status?: string }) {
    return this.repository.listDeliveries(filter);
  }
}
