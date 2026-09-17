import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { auditLogs } from '../../../../shared/database/schema';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOrders } from '../../../marketplace/infrastructure/persistence/marketplace-order.schema';
import { payments } from '../../../payment/infrastructure/persistence/payment.schema';

export interface AuditLogFilter {
  identityId?: string;
  operation?: string;
  resource?: string;
  correlationId?: string;
  from?: Date;
  to?: Date;
}

/**
 * IP-018 — camada de leitura READ-ONLY entre-módulos para dois gaps do
 * console admin: busca de `audit_logs` (a trilha existe desde IP-000, mas
 * nunca teve um método de consulta — `AuditLogService` é só `record`/
 * `recordSafe`) e o "support lookup" cross-entity. Mesmo padrão do
 * `AnalyticsRepository` (IP-020): importa as TABELAS de outros módulos e
 * roda queries próprias na conexão `DRIZZLE` global, sem estender nenhum
 * repositório de domínio de Identity/Marketplace/Payment — zero alteração a
 * `identity/**`, `marketplace/**`, `payment/**` além desta leitura agregada.
 */
@Injectable()
export class AdminOpsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async searchAuditLogs(filter: AuditLogFilter, page: number, pageSize: number) {
    const conditions = [];
    if (filter.identityId) conditions.push(eq(auditLogs.identityId, filter.identityId));
    if (filter.operation) conditions.push(eq(auditLogs.operation, filter.operation));
    if (filter.resource) conditions.push(eq(auditLogs.resource, filter.resource));
    if (filter.correlationId) conditions.push(eq(auditLogs.correlationId, filter.correlationId));
    if (filter.from) conditions.push(gte(auditLogs.occurredAt, filter.from));
    if (filter.to) conditions.push(lte(auditLogs.occurredAt, filter.to));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, totalRow] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.occurredAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    ]);

    return { items, totalItems: totalRow[0]?.count ?? 0 };
  }

  /** Identidade por e-mail — dado mínimo para "support pode achar o usuário". */
  async findIdentityByEmail(email: string) {
    const rows = await this.db
      .select({
        id: identities.id,
        fullName: identities.fullName,
        email: identities.email,
        status: identities.status,
        isAdmin: identities.isAdmin,
        createdAt: identities.createdAt,
        lastLoginAt: identities.lastLoginAt,
      })
      .from(identities)
      .where(eq(identities.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async findIdentityById(identityId: string) {
    const rows = await this.db
      .select({
        id: identities.id,
        fullName: identities.fullName,
        email: identities.email,
        status: identities.status,
        isAdmin: identities.isAdmin,
        createdAt: identities.createdAt,
        lastLoginAt: identities.lastLoginAt,
      })
      .from(identities)
      .where(eq(identities.id, identityId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Pedidos onde a identidade é comprador ou vendedor — recorte mínimo de suporte. */
  async listOrdersForIdentity(identityId: string, limit = 20) {
    return this.db
      .select({
        id: marketplaceOrders.id,
        status: marketplaceOrders.status,
        buyerId: marketplaceOrders.buyerId,
        sellerId: marketplaceOrders.sellerId,
        amount: marketplaceOrders.amount,
        currency: marketplaceOrders.currency,
        createdAt: marketplaceOrders.createdAt,
      })
      .from(marketplaceOrders)
      .where(
        sql`${marketplaceOrders.buyerId} = ${identityId} OR ${marketplaceOrders.sellerId} = ${identityId}`,
      )
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(limit);
  }

  async findOrderById(orderId: string) {
    const rows = await this.db
      .select()
      .from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, orderId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findPaymentByOrderId(orderId: string) {
    const rows = await this.db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    return rows[0] ?? null;
  }

  async findPaymentById(paymentId: string) {
    const rows = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    return rows[0] ?? null;
  }
}
