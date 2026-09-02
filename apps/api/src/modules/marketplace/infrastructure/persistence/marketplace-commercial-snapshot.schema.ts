import {
  char,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { marketplaceOrders } from './marketplace-order.schema';

/**
 * PACK-02 §7 — snapshot econômico imutável do Trust Contract, um por pedido
 * (`UNIQUE(order_id)`). Append-only: nasce no aceite da proposta
 * (`AcceptOfferUseCase`) e nunca é atualizado depois — mudanças futuras na
 * `commercial_policies` não retroagem sobre uma linha já gravada aqui.
 */
export const marketplaceOrderCommercialSnapshots = pgTable(
  'marketplace_order_commercial_snapshots',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    pricingModel: varchar('pricing_model', { length: 20 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    grossAmount: numeric('gross_amount', { precision: 18, scale: 2 }).notNull(),
    serviceAmount: numeric('service_amount', { precision: 18, scale: 2 }).notNull(),
    materialCostAmount: numeric('material_cost_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    materialMarkupAmount: numeric('material_markup_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    trustFeeRateBps: integer('trust_fee_rate_bps').notNull(),
    trustFeeBaseAmount: numeric('trust_fee_base_amount', { precision: 18, scale: 2 }).notNull(),
    trustFeeAmount: numeric('trust_fee_amount', { precision: 18, scale: 2 }).notNull(),
    providerNetBeforePspFees: numeric('provider_net_before_psp_fees', {
      precision: 18,
      scale: 2,
    }).notNull(),
    hourlyRateAmount: numeric('hourly_rate_amount', { precision: 18, scale: 2 }),
    minimumMinutes: integer('minimum_minutes'),
    billingIncrementMinutes: integer('billing_increment_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_marketplace_order_commercial_snapshot_order').on(table.orderId)],
);

export type MarketplaceOrderCommercialSnapshotRow =
  typeof marketplaceOrderCommercialSnapshots.$inferSelect;
