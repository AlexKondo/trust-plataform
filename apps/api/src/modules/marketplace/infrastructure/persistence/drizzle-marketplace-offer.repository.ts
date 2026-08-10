import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import { OFFER_STATUS, OfferStatus } from '../../domain/entities/marketplace-types';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { MarketplaceOfferRow, marketplaceOffers } from './marketplace-offer.schema';

@Injectable()
export class DrizzleMarketplaceOfferRepository extends MarketplaceOfferRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(offer: MarketplaceOffer, executor?: DatabaseExecutor): Promise<void> {
    await this.saveAll([offer], executor);
  }

  async saveAll(offers: MarketplaceOffer[], executor?: DatabaseExecutor): Promise<void> {
    if (offers.length === 0) {
      return;
    }
    const target = executor ?? this.db;
    for (const offer of offers) {
      const props = offer.toProps();
      const values = {
        ...props,
        amount: props.amount.toFixed(2),
        quantity: props.quantity.toFixed(4),
      };
      await target
        .insert(marketplaceOffers)
        .values(values)
        .onConflictDoUpdate({
          target: marketplaceOffers.id,
          // Identidade da proposta (partes, anúncio, autor, pai) é imutável.
          set: {
            amount: values.amount,
            quantity: values.quantity,
            status: values.status,
            expiresAt: values.expiresAt,
            notes: values.notes,
            withdrewAt: values.withdrewAt,
            withdrewBy: values.withdrewBy,
            withdrawReason: values.withdrawReason,
            rejectedAt: values.rejectedAt,
            rejectedBy: values.rejectedBy,
            rejectReason: values.rejectReason,
            acceptedAt: values.acceptedAt,
            acceptedBy: values.acceptedBy,
            updatedAt: values.updatedAt,
          },
        });
    }
  }

  async findById(id: string): Promise<MarketplaceOffer | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceOffers)
      .where(eq(marketplaceOffers.id, id))
      .limit(1);
    return row ? toOffer(row) : null;
  }

  async findByConversation(conversationId: string): Promise<MarketplaceOffer[]> {
    const rows = await this.db
      .select()
      .from(marketplaceOffers)
      .where(eq(marketplaceOffers.conversationId, conversationId))
      .orderBy(asc(marketplaceOffers.createdAt));
    return rows.map(toOffer);
  }

  async findPendingByConversation(
    conversationId: string,
    executor?: DatabaseExecutor,
  ): Promise<MarketplaceOffer[]> {
    const target = executor ?? this.db;
    const rows = await target
      .select()
      .from(marketplaceOffers)
      .where(
        and(
          eq(marketplaceOffers.conversationId, conversationId),
          eq(marketplaceOffers.status, OFFER_STATUS.PENDING),
        ),
      )
      .orderBy(asc(marketplaceOffers.createdAt));
    return rows.map(toOffer);
  }

  async findByParentOffer(parentOfferId: string): Promise<MarketplaceOffer | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceOffers)
      .where(eq(marketplaceOffers.parentOfferId, parentOfferId))
      .limit(1);
    return row ? toOffer(row) : null;
  }
}

function toOffer(row: MarketplaceOfferRow): MarketplaceOffer {
  return MarketplaceOffer.restore({
    id: row.id,
    conversationId: row.conversationId,
    listingId: row.listingId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    createdBy: row.createdBy,
    parentOfferId: row.parentOfferId,
    amount: Number(row.amount),
    // `char(3)` volta com padding do Postgres — o domínio guarda só o código.
    currency: row.currency.trim(),
    quantity: Number(row.quantity),
    status: row.status as OfferStatus,
    expiresAt: row.expiresAt,
    notes: row.notes,
    withdrewAt: row.withdrewAt,
    withdrewBy: row.withdrewBy,
    withdrawReason: row.withdrawReason,
    rejectedAt: row.rejectedAt,
    rejectedBy: row.rejectedBy,
    rejectReason: row.rejectReason,
    acceptedAt: row.acceptedAt,
    acceptedBy: row.acceptedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

