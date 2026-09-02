import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceCommercialSnapshot } from '../../domain/entities/marketplace-commercial-snapshot';
import { PricingModel } from '../../domain/entities/marketplace-types';
import { MarketplaceCommercialSnapshotRepository } from '../../domain/repositories/marketplace-commercial-snapshot.repository';
import {
  MarketplaceOrderCommercialSnapshotRow,
  marketplaceOrderCommercialSnapshots,
} from './marketplace-commercial-snapshot.schema';

@Injectable()
export class DrizzleMarketplaceCommercialSnapshotRepository extends MarketplaceCommercialSnapshotRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(snapshot: MarketplaceCommercialSnapshot, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = snapshot.toProps();
    // Append-only (fato econômico imutável): insert puro, nunca upsert/update.
    await target.insert(marketplaceOrderCommercialSnapshots).values({
      id: props.id,
      orderId: props.orderId,
      pricingModel: props.pricingModel,
      currency: props.currency,
      grossAmount: props.grossAmount.toFixed(2),
      serviceAmount: props.serviceAmount.toFixed(2),
      materialCostAmount: props.materialCostAmount.toFixed(2),
      materialMarkupAmount: props.materialMarkupAmount.toFixed(2),
      trustFeeRateBps: props.trustFeeRateBps,
      trustFeeBaseAmount: props.trustFeeBaseAmount.toFixed(2),
      trustFeeAmount: props.trustFeeAmount.toFixed(2),
      providerNetBeforePspFees: props.providerNetBeforePspFees.toFixed(2),
      hourlyRateAmount: props.hourlyRateAmount === null ? null : props.hourlyRateAmount.toFixed(2),
      minimumMinutes: props.minimumMinutes,
      billingIncrementMinutes: props.billingIncrementMinutes,
      createdAt: props.createdAt,
    });
  }

  async findByOrderId(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<MarketplaceCommercialSnapshot | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(marketplaceOrderCommercialSnapshots)
      .where(eq(marketplaceOrderCommercialSnapshots.orderId, orderId))
      .limit(1);
    return row ? toSnapshot(row) : null;
  }
}

function toSnapshot(row: MarketplaceOrderCommercialSnapshotRow): MarketplaceCommercialSnapshot {
  return MarketplaceCommercialSnapshot.restore({
    id: row.id,
    orderId: row.orderId,
    pricingModel: row.pricingModel as PricingModel,
    currency: row.currency.trim(),
    grossAmount: Number(row.grossAmount),
    serviceAmount: Number(row.serviceAmount),
    materialCostAmount: Number(row.materialCostAmount),
    materialMarkupAmount: Number(row.materialMarkupAmount),
    trustFeeRateBps: row.trustFeeRateBps,
    trustFeeBaseAmount: Number(row.trustFeeBaseAmount),
    trustFeeAmount: Number(row.trustFeeAmount),
    providerNetBeforePspFees: Number(row.providerNetBeforePspFees),
    hourlyRateAmount: row.hourlyRateAmount === null ? null : Number(row.hourlyRateAmount),
    minimumMinutes: row.minimumMinutes,
    billingIncrementMinutes: row.billingIncrementMinutes,
    createdAt: row.createdAt,
  });
}
