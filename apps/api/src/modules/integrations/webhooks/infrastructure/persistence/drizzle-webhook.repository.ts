import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../../shared/database/database.module';
import {
  NewWebhookSubscriptionRow,
  WebhookSubscriptionRow,
  webhookSubscriptions,
} from './webhook-subscriptions.schema';
import {
  WEBHOOK_DELIVERY_STATUS,
  WebhookDeliveryRow,
  webhookDeliveries,
} from './webhook-deliveries.schema';

@Injectable()
export class WebhookSubscriptionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(
    input: Omit<NewWebhookSubscriptionRow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WebhookSubscriptionRow> {
    const now = new Date();
    const [row] = await this.db
      .insert(webhookSubscriptions)
      .values({ id: uuidv7(), createdAt: now, updatedAt: now, ...input })
      .returning();
    if (!row) {
      throw new Error('Webhook subscription insert returned no row.');
    }
    return row;
  }

  async list(onlyActive: boolean): Promise<WebhookSubscriptionRow[]> {
    const query = this.db.select().from(webhookSubscriptions).orderBy(desc(webhookSubscriptions.createdAt));
    if (onlyActive) {
      return query.where(eq(webhookSubscriptions.active, true));
    }
    return query;
  }

  async findById(id: string): Promise<WebhookSubscriptionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, id))
      .limit(1);
    return row;
  }

  /** Consumers usam este método — só assinaturas ativas entregam. */
  async findActiveBySubscribedEventType(eventType: string): Promise<WebhookSubscriptionRow[]> {
    const rows = await this.db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.active, true));
    return rows.filter((row) => row.eventTypes.includes(eventType));
  }

  async updateUrlAndEvents(
    id: string,
    fields: Partial<Pick<NewWebhookSubscriptionRow, 'url' | 'eventTypes' | 'description'>>,
  ): Promise<WebhookSubscriptionRow | undefined> {
    const [row] = await this.db
      .update(webhookSubscriptions)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(webhookSubscriptions.id, id))
      .returning();
    return row;
  }

  async setActive(id: string, active: boolean): Promise<WebhookSubscriptionRow | undefined> {
    const [row] = await this.db
      .update(webhookSubscriptions)
      .set({ active, updatedAt: new Date() })
      .where(eq(webhookSubscriptions.id, id))
      .returning();
    return row;
  }

  async rotateSecret(id: string, newSecret: string): Promise<WebhookSubscriptionRow | undefined> {
    const current = await this.findById(id);
    if (!current) {
      return undefined;
    }
    const [row] = await this.db
      .update(webhookSubscriptions)
      .set({
        secretPrevious: current.secretActive,
        secretActive: newSecret,
        secretRotatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookSubscriptions.id, id))
      .returning();
    return row;
  }

  /** Confirma a rotação — descarta o segredo anterior (não é mais aceito para verificação). */
  async clearPreviousSecret(id: string): Promise<WebhookSubscriptionRow | undefined> {
    const [row] = await this.db
      .update(webhookSubscriptions)
      .set({ secretPrevious: null, updatedAt: new Date() })
      .where(eq(webhookSubscriptions.id, id))
      .returning();
    return row;
  }

  // ---- Deliveries (retry/DLQ bookkeeping) ----

  async findDelivery(
    subscriptionId: string,
    eventId: string,
    executor?: DatabaseExecutor,
  ): Promise<WebhookDeliveryRow | undefined> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.subscriptionId, subscriptionId), eq(webhookDeliveries.eventId, eventId)))
      .limit(1);
    return row;
  }

  async createPendingDelivery(
    subscriptionId: string,
    eventId: string,
    eventType: string,
    payloadVersion: string,
    executor?: DatabaseExecutor,
  ): Promise<WebhookDeliveryRow> {
    const target = executor ?? this.db;
    const now = new Date();
    const [row] = await target
      .insert(webhookDeliveries)
      .values({
        id: uuidv7(),
        subscriptionId,
        eventId,
        eventType,
        payloadVersion,
        status: WEBHOOK_DELIVERY_STATUS.PENDING,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      return row;
    }
    const existing = await this.findDelivery(subscriptionId, eventId, executor);
    if (!existing) {
      throw new Error(
        `Webhook delivery insert conflicted but no existing row found (subscriptionId=${subscriptionId}, eventId=${eventId}).`,
      );
    }
    return existing;
  }

  async recordAttemptResult(
    deliveryId: string,
    result: { success: boolean; responseStatus?: number; error?: string; deadLetter: boolean },
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(webhookDeliveries)
      .set({
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        status: result.success
          ? WEBHOOK_DELIVERY_STATUS.SUCCESS
          : result.deadLetter
            ? WEBHOOK_DELIVERY_STATUS.DEAD_LETTER
            : WEBHOOK_DELIVERY_STATUS.PENDING,
        responseStatus: result.responseStatus,
        lastError: result.error,
        deliveredAt: result.success ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  }

  async listDeliveries(filter: {
    subscriptionId?: string;
    status?: string;
  }): Promise<WebhookDeliveryRow[]> {
    const conditions = [];
    if (filter.subscriptionId) {
      conditions.push(eq(webhookDeliveries.subscriptionId, filter.subscriptionId));
    }
    if (filter.status) {
      conditions.push(eq(webhookDeliveries.status, filter.status));
    }
    const query = this.db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.updatedAt));
    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  }

  async deliveryHealth(subscriptionId: string): Promise<{ success: number; pending: number; deadLetter: number }> {
    const rows = await this.db
      .select({ status: webhookDeliveries.status, count: sql<number>`count(*)::int` })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.subscriptionId, subscriptionId))
      .groupBy(webhookDeliveries.status);
    const health = { success: 0, pending: 0, deadLetter: 0 };
    for (const row of rows) {
      if (row.status === WEBHOOK_DELIVERY_STATUS.SUCCESS) health.success = row.count;
      else if (row.status === WEBHOOK_DELIVERY_STATUS.PENDING) health.pending = row.count;
      else if (row.status === WEBHOOK_DELIVERY_STATUS.DEAD_LETTER) health.deadLetter = row.count;
    }
    return health;
  }
}
