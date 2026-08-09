import { Inject, Injectable } from '@nestjs/common';
import { SQL, and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { trustScores } from '../../../trust-score/infrastructure/persistence/trust-score.schema';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { LISTING_STATUS, ListingStatus, ListingType, SEARCH_SORT } from '../../domain/entities/marketplace-types';
import {
  ListingImage,
  ListingSearchCriteria,
  ListingSearchRow,
  MarketplaceCategory,
  MarketplaceListingRepository,
} from '../../domain/repositories/marketplace-listing.repository';
import {
  MarketplaceCategoryRow,
  MarketplaceListingRow,
  marketplaceCategories,
  marketplaceListingImages,
  marketplaceListings,
} from './marketplace.schema';

@Injectable()
export class DrizzleMarketplaceListingRepository extends MarketplaceListingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(listing: MarketplaceListing, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = listing.toProps();
    const values = {
      id: props.id,
      ownerId: props.ownerId,
      title: props.title,
      description: props.description,
      listingType: props.listingType,
      categoryId: props.categoryId,
      price: props.price === null ? null : props.price.toFixed(2),
      currency: props.currency,
      location: props.location,
      status: props.status,
      publishedAt: props.publishedAt,
      viewCount: props.viewCount,
      lastViewedAt: props.lastViewedAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      deletedAt: props.deletedAt,
    };
    await target
      .insert(marketplaceListings)
      .values(values)
      .onConflictDoUpdate({
        target: marketplaceListings.id,
        // viewCount/lastViewedAt ficam de fora: são atualizados por incremento
        // atômico (incrementViewCount) e não podem ser sobrescritos por uma
        // edição concorrente do dono.
        set: {
          title: values.title,
          description: values.description,
          listingType: values.listingType,
          categoryId: values.categoryId,
          price: values.price,
          currency: values.currency,
          location: values.location,
          status: values.status,
          publishedAt: values.publishedAt,
          updatedAt: values.updatedAt,
          deletedAt: values.deletedAt,
        },
      });
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findPublishedById(id: string): Promise<MarketplaceListing | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.id, id),
          eq(marketplaceListings.status, LISTING_STATUS.PUBLISHED),
          isNull(marketplaceListings.deletedAt),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByOwner(
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceListing[]; totalItems: number }> {
    const where = and(eq(marketplaceListings.ownerId, ownerId), isNull(marketplaceListings.deletedAt));
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(marketplaceListings)
        .where(where)
        .orderBy(desc(marketplaceListings.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketplaceListings)
        .where(where),
    ]);
    return { items: rows.map(toDomain), totalItems: total?.count ?? 0 };
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: marketplaceListings.id })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
      .limit(1);
    return Boolean(row);
  }

  async incrementViewCount(id: string, viewedAt: Date, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    await target
      .update(marketplaceListings)
      .set({
        viewCount: sql`${marketplaceListings.viewCount} + 1`,
        lastViewedAt: viewedAt,
      })
      .where(eq(marketplaceListings.id, id));
  }

  /**
   * MRK-004 — busca. O LEFT JOIN em `trust_scores` é uma leitura de projeção do
   * Trust Layer (o Marketplace nunca escreve nele): sem ela não há filtro por
   * nível mínimo nem ordenação por reputação em uma única consulta paginada.
   */
  async search(
    criteria: ListingSearchCriteria,
  ): Promise<{ items: ListingSearchRow[]; totalItems: number }> {
    const filters: SQL[] = [
      eq(marketplaceListings.status, LISTING_STATUS.PUBLISHED),
      isNull(marketplaceListings.deletedAt),
    ];

    if (criteria.text) {
      const pattern = `%${criteria.text}%`;
      const textFilter = or(
        ilike(marketplaceListings.title, pattern),
        ilike(marketplaceListings.description, pattern),
      );
      if (textFilter) {
        filters.push(textFilter);
      }
    }
    if (criteria.categoryId) {
      filters.push(eq(marketplaceListings.categoryId, criteria.categoryId));
    }
    if (criteria.listingType) {
      filters.push(eq(marketplaceListings.listingType, criteria.listingType));
    }
    if (criteria.minPrice !== undefined) {
      filters.push(gte(marketplaceListings.price, criteria.minPrice.toFixed(2)));
    }
    if (criteria.maxPrice !== undefined) {
      filters.push(lte(marketplaceListings.price, criteria.maxPrice.toFixed(2)));
    }
    if (criteria.currency) {
      filters.push(eq(marketplaceListings.currency, criteria.currency));
    }
    if (criteria.location) {
      filters.push(ilike(marketplaceListings.location, `%${criteria.location}%`));
    }
    if (criteria.allowedSellerLevels) {
      filters.push(inArray(trustScores.level, criteria.allowedSellerLevels));
    }

    const where = and(...filters);
    const firstImage = sql<string | null>`(
      select i.url from ${marketplaceListingImages} i
      where i.listing_id = ${marketplaceListings.id}
      order by i.position asc limit 1
    )`;

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: marketplaceListings.id,
          title: marketplaceListings.title,
          description: marketplaceListings.description,
          listingType: marketplaceListings.listingType,
          categoryCode: marketplaceCategories.code,
          categoryName: marketplaceCategories.name,
          price: marketplaceListings.price,
          currency: marketplaceListings.currency,
          location: marketplaceListings.location,
          publishedAt: marketplaceListings.publishedAt,
          viewCount: marketplaceListings.viewCount,
          imageUrl: firstImage,
          ownerId: marketplaceListings.ownerId,
          sellerScore: trustScores.score,
          sellerLevel: trustScores.level,
        })
        .from(marketplaceListings)
        .leftJoin(marketplaceCategories, eq(marketplaceListings.categoryId, marketplaceCategories.id))
        .leftJoin(trustScores, eq(trustScores.identityId, marketplaceListings.ownerId))
        .where(where)
        .orderBy(...orderFor(criteria.sort))
        .limit(criteria.pageSize)
        .offset((criteria.page - 1) * criteria.pageSize),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketplaceListings)
        .leftJoin(trustScores, eq(trustScores.identityId, marketplaceListings.ownerId))
        .where(where),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        price: row.price === null ? null : Number(row.price),
        currency: row.currency.trim(),
      })),
      totalItems: total?.count ?? 0,
    };
  }

  async listImages(listingId: string): Promise<ListingImage[]> {
    const rows = await this.db
      .select({ url: marketplaceListingImages.url, position: marketplaceListingImages.position })
      .from(marketplaceListingImages)
      .where(eq(marketplaceListingImages.listingId, listingId))
      .orderBy(asc(marketplaceListingImages.position));
    return rows;
  }

  async replaceImages(
    listingId: string,
    urls: string[],
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target
      .delete(marketplaceListingImages)
      .where(eq(marketplaceListingImages.listingId, listingId));
    if (urls.length > 0) {
      await target.insert(marketplaceListingImages).values(
        urls.map((url, position) => ({
          id: uuidv7(),
          listingId,
          url,
          position,
          createdAt: new Date(),
        })),
      );
    }
  }

  async listCategories(activeOnly: boolean): Promise<MarketplaceCategory[]> {
    const rows = activeOnly
      ? await this.db
          .select()
          .from(marketplaceCategories)
          .where(eq(marketplaceCategories.active, true))
          .orderBy(asc(marketplaceCategories.name))
      : await this.db.select().from(marketplaceCategories).orderBy(asc(marketplaceCategories.name));
    return rows.map(toCategory);
  }

  async findCategoryById(id: string): Promise<MarketplaceCategory | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceCategories)
      .where(eq(marketplaceCategories.id, id))
      .limit(1);
    return row ? toCategory(row) : null;
  }

  async findCategoryByCode(code: string): Promise<MarketplaceCategory | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceCategories)
      .where(eq(marketplaceCategories.code, code))
      .limit(1);
    return row ? toCategory(row) : null;
  }
}

/** BR-005 do MRK-004: `relevance` no MVP = mais recentes primeiro. */
function orderFor(sort: ListingSearchCriteria['sort']): SQL[] {
  switch (sort) {
    case SEARCH_SORT.PRICE_ASC:
      return [sql`${marketplaceListings.price} asc nulls last`];
    case SEARCH_SORT.PRICE_DESC:
      return [sql`${marketplaceListings.price} desc nulls last`];
    case SEARCH_SORT.TRUST_SCORE:
      return [sql`${trustScores.score} desc nulls last`, desc(marketplaceListings.publishedAt)];
    case SEARCH_SORT.RECENT:
    case SEARCH_SORT.RELEVANCE:
    default:
      return [sql`${marketplaceListings.publishedAt} desc nulls last`];
  }
}

function toCategory(row: MarketplaceCategoryRow): MarketplaceCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    minimumTrustLevel: row.minimumTrustLevel,
    minimumScore: row.minimumScore,
    active: row.active,
  };
}

function toDomain(row: MarketplaceListingRow): MarketplaceListing {
  return MarketplaceListing.restore({
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description,
    listingType: (row.listingType as ListingType | null) ?? null,
    categoryId: row.categoryId,
    price: row.price === null ? null : Number(row.price),
    // `char(3)` volta com padding do Postgres — o domínio guarda só o código.
    currency: row.currency.trim(),
    location: row.location,
    status: row.status as ListingStatus,
    publishedAt: row.publishedAt,
    viewCount: Number(row.viewCount),
    lastViewedAt: row.lastViewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}
