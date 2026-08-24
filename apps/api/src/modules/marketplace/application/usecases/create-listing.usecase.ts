import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceCategoryNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import {
  MarketplaceCategory,
  MarketplaceListingRepository,
} from '../../domain/repositories/marketplace-listing.repository';
import { CreateListingRequest, ListingResponse, RequestMeta } from '../dto/marketplace.dtos';
import { toListingResponse } from '../mapper/marketplace.mapper';

export const MRK_PRODUCER = 'marketplace-service';

/** MRK-001 — cria o anúncio em DRAFT para o usuário autenticado. */
@Injectable()
export class CreateListingUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateListingUseCase.name);
  }

  async execute(
    identityId: string,
    body: CreateListingRequest,
    meta: RequestMeta = {},
  ): Promise<ListingResponse> {
    const category = await resolveCategory(this.listingRepository, body.category);

    const listing = MarketplaceListing.createDraft({
      ownerId: identityId,
      title: body.title,
      description: body.description ?? null,
      listingType: body.listingType ?? null,
      categoryId: category?.id ?? null,
      price: body.price ?? null,
      currency: body.currency ?? 'BRL',
      location: body.location ?? null,
    });
    const images = body.images ?? [];

    await this.db.transaction(async (tx) => {
      await this.listingRepository.save(listing, tx);
      if (images.length > 0) {
        await this.listingRepository.replaceImages(listing.id, images, tx);
      }
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceListing.Created',
        aggregateType: 'MarketplaceListing',
        aggregateId: listing.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? listing.id,
        payload: {
          listingId: listing.id,
          ownerId: identityId,
          status: listing.status,
          createdAt: listing.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CreateMarketplaceListing',
          resource: 'MarketplaceListing',
          resourceId: listing.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { category: category?.code ?? null, listingType: listing.listingType },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CreateMarketplaceListing',
        identityId,
        listingId: listing.id,
        category: category?.code ?? null,
        listingType: listing.listingType,
        status: listing.status,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace listing created.',
    );

    return toListingResponse(listing, { category, images, includePublishingHints: true });
  }
}

/** Categoria vem por código (`ELECTRICAL`) — inexistente/inativa é erro de negócio. */
export async function resolveCategory(
  repository: MarketplaceListingRepository,
  code: string | undefined,
): Promise<MarketplaceCategory | null> {
  if (!code) {
    return null;
  }
  const category = await repository.findCategoryByCode(code.toUpperCase());
  if (!category || !category.active) {
    throw new MarketplaceCategoryNotFoundException(code);
  }
  return category;
}
