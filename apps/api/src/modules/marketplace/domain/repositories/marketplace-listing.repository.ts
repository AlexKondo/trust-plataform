import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceListing } from '../entities/marketplace-listing';
import { ListingType, SearchSort } from '../entities/marketplace-types';

export interface MarketplaceCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  minimumTrustLevel: string | null;
  minimumScore: number;
  active: boolean;
}

export interface ListingImage {
  url: string;
  position: number;
}

/** Critérios da busca (MRK-004 BR-003/005/006). */
export interface ListingSearchCriteria {
  text?: string;
  categoryId?: string;
  listingType?: ListingType;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  location?: string;
  /** Níveis aceitos do anunciante (já expandidos por rank pelo caso de uso). */
  allowedSellerLevels?: string[];
  sort: SearchSort;
  page: number;
  pageSize: number;
}

/** Linha resumida da busca (MRK-004 BR-007) — inclui a reputação do anunciante. */
export interface ListingSearchRow {
  id: string;
  title: string;
  description: string | null;
  listingType: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  price: number | null;
  currency: string;
  location: string | null;
  publishedAt: Date | null;
  viewCount: number;
  imageUrl: string | null;
  ownerId: string;
  sellerScore: number | null;
  sellerLevel: string | null;
}

/** Contrato de persistência do anúncio (só persistência — zero regra de negócio). */
export abstract class MarketplaceListingRepository {
  abstract save(listing: MarketplaceListing, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<MarketplaceListing | null>;
  abstract findPublishedById(id: string): Promise<MarketplaceListing | null>;
  abstract findByOwner(
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceListing[]; totalItems: number }>;
  abstract exists(id: string): Promise<boolean>;

  /** MRK-005 BR-004 — incremento atômico, sem ler-modificar-escrever. */
  abstract incrementViewCount(id: string, viewedAt: Date, executor?: DatabaseExecutor): Promise<void>;

  abstract search(
    criteria: ListingSearchCriteria,
  ): Promise<{ items: ListingSearchRow[]; totalItems: number }>;

  abstract listImages(listingId: string): Promise<ListingImage[]>;
  abstract replaceImages(
    listingId: string,
    urls: string[],
    executor?: DatabaseExecutor,
  ): Promise<void>;

  abstract listCategories(activeOnly: boolean): Promise<MarketplaceCategory[]>;
  abstract findCategoryById(id: string): Promise<MarketplaceCategory | null>;
  abstract findCategoryByCode(code: string): Promise<MarketplaceCategory | null>;
}
