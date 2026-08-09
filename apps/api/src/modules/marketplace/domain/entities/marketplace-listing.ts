import { v7 as uuidv7 } from 'uuid';
import {
  MarketplaceListingAlreadyPublishedException,
  MarketplaceListingIncompleteException,
  MarketplaceListingNotEditableException,
} from '../exceptions/marketplace.exceptions';
import {
  EDITABLE_STATUSES,
  LISTING_STATUS,
  ListingStatus,
  ListingType,
  PUBLICLY_VISIBLE_STATUSES,
} from './marketplace-types';

export interface MarketplaceListingProps {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  listingType: ListingType | null;
  categoryId: string | null;
  price: number | null;
  currency: string;
  location: string | null;
  status: ListingStatus;
  publishedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ListingContentInput {
  title?: string;
  description?: string | null;
  listingType?: ListingType | null;
  categoryId?: string | null;
  price?: number | null;
  currency?: string;
  location?: string | null;
}

/** Campos exigidos para publicar (MRK-001 BR-002 cobrado no MRK-003 BR-003). */
const REQUIRED_TO_PUBLISH = [
  'title',
  'description',
  'listingType',
  'categoryId',
  'price',
  'currency',
] as const;

/**
 * Aggregate root do anúncio (MRK-001..005).
 * Invariantes: pertence a um único dono (BR-005 do MRK-001) e nunca troca de
 * dono; rascunho pode nascer incompleto (BR-004) mas só publica completo;
 * publicação é a única transição de status desta feature (MRK-002 BR-003).
 */
export class MarketplaceListing {
  private constructor(private readonly props: MarketplaceListingProps) {}

  /** MRK-001 — nasce sempre em DRAFT (BR-003), com o criador como dono (BR-005). */
  static createDraft(input: { ownerId: string; title: string } & ListingContentInput): MarketplaceListing {
    const now = new Date();
    return new MarketplaceListing({
      id: uuidv7(),
      ownerId: input.ownerId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      listingType: input.listingType ?? null,
      categoryId: input.categoryId ?? null,
      price: input.price ?? null,
      currency: input.currency ?? 'BRL',
      location: input.location?.trim() ?? null,
      status: LISTING_STATUS.DRAFT,
      publishedAt: null,
      viewCount: 0,
      lastViewedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static restore(props: MarketplaceListingProps): MarketplaceListing {
    return new MarketplaceListing(props);
  }

  get id(): string {
    return this.props.id;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | null {
    return this.props.description;
  }

  get listingType(): ListingType | null {
    return this.props.listingType;
  }

  get categoryId(): string | null {
    return this.props.categoryId;
  }

  get price(): number | null {
    return this.props.price;
  }

  get currency(): string {
    return this.props.currency;
  }

  get location(): string | null {
    return this.props.location;
  }

  get status(): ListingStatus {
    return this.props.status;
  }

  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }

  get viewCount(): number {
    return this.props.viewCount;
  }

  get lastViewedAt(): Date | null {
    return this.props.lastViewedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  isOwnedBy(identityId: string): boolean {
    return this.props.ownerId === identityId;
  }

  isPubliclyVisible(): boolean {
    return !this.props.deletedAt && PUBLICLY_VISIBLE_STATUSES.includes(this.props.status);
  }

  /**
   * MRK-002 — atualiza os atributos editáveis. Não altera id, dono nem status
   * (BR-002/BR-003); `updatedAt` é sempre renovado quando algo muda (BR-005).
   * Retorna os campos alterados (payload do MarketplaceListing.Updated).
   */
  update(input: ListingContentInput, now = new Date()): string[] {
    if (!EDITABLE_STATUSES.includes(this.props.status) || this.props.deletedAt) {
      throw new MarketplaceListingNotEditableException(this.props.status);
    }

    const updatedFields: string[] = [];
    const apply = <K extends keyof MarketplaceListingProps>(
      field: K,
      value: MarketplaceListingProps[K],
    ): void => {
      if (this.props[field] !== value) {
        this.props[field] = value;
        updatedFields.push(field);
      }
    };

    if (input.title !== undefined) {
      apply('title', input.title.trim());
    }
    if (input.description !== undefined) {
      apply('description', input.description?.trim() ?? null);
    }
    if (input.listingType !== undefined) {
      apply('listingType', input.listingType);
    }
    if (input.categoryId !== undefined) {
      apply('categoryId', input.categoryId);
    }
    if (input.price !== undefined) {
      apply('price', input.price);
    }
    if (input.currency !== undefined) {
      apply('currency', input.currency);
    }
    if (input.location !== undefined) {
      apply('location', input.location?.trim() ?? null);
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = now;
    }
    return updatedFields;
  }

  /** Campos obrigatórios ainda vazios (MRK-003 BR-003). */
  missingRequiredFields(): string[] {
    return REQUIRED_TO_PUBLISH.filter((field) => {
      const value = this.props[field];
      if (field === 'price') {
        return typeof value !== 'number' || value <= 0;
      }
      return value === null || value === undefined || String(value).trim() === '';
    });
  }

  /**
   * MRK-003 — publica. A elegibilidade do anunciante (BR-004/BR-005) é
   * verificada antes, na camada de aplicação, porque depende do Trust Layer.
   */
  publish(now = new Date()): void {
    if (this.props.status !== LISTING_STATUS.DRAFT || this.props.deletedAt) {
      throw new MarketplaceListingAlreadyPublishedException(this.props.status);
    }
    const missing = this.missingRequiredFields();
    if (missing.length > 0) {
      throw new MarketplaceListingIncompleteException(missing);
    }
    this.props.status = LISTING_STATUS.PUBLISHED;
    this.props.publishedAt = now;
    this.props.updatedAt = now;
  }

  /** MRK-005 BR-004 — registra uma visualização. */
  registerView(now = new Date()): void {
    this.props.viewCount += 1;
    this.props.lastViewedAt = now;
  }

  toProps(): MarketplaceListingProps {
    return { ...this.props };
  }
}
