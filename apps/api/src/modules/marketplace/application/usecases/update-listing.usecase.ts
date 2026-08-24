import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  MarketplaceListingNotFoundException,
  MarketplaceListingOwnershipException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ListingResponse, RequestMeta, UpdateListingRequest } from '../dto/marketplace.dtos';
import { toListingResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER, resolveCategory } from './create-listing.usecase';

/** MRK-002 — atualiza o anúncio (só o dono; status inalterado). */
@Injectable()
export class UpdateListingUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UpdateListingUseCase.name);
  }

  async execute(
    identityId: string,
    listingId: string,
    body: UpdateListingRequest,
    meta: RequestMeta = {},
  ): Promise<ListingResponse> {
    const listing = await this.listingRepository.findById(listingId);
    if (!listing || listing.deletedAt) {
      throw new MarketplaceListingNotFoundException();
    }
    // BR-001: ownership antes de qualquer validação de conteúdo.
    if (!listing.isOwnedBy(identityId)) {
      throw new MarketplaceListingOwnershipException();
    }

    const category =
      body.category === undefined
        ? await this.currentCategory(listing.categoryId)
        : await resolveCategory(this.listingRepository, body.category);

    const updatedFields = listing.update({
      title: body.title,
      description: body.description,
      listingType: body.listingType,
      categoryId: body.category === undefined ? undefined : (category?.id ?? null),
      price: body.price,
      currency: body.currency,
      location: body.location,
    });

    const imagesChanged = body.images !== undefined;
    if (imagesChanged) {
      updatedFields.push('images');
    }

    if (updatedFields.length > 0) {
      await this.db.transaction(async (tx) => {
        await this.listingRepository.save(listing, tx);
        if (imagesChanged) {
          await this.listingRepository.replaceImages(listing.id, body.images ?? [], tx);
        }
        await this.outboxService.enqueue(tx, {
          eventType: 'MarketplaceListing.Updated',
          aggregateType: 'MarketplaceListing',
          aggregateId: listing.id,
          producer: MRK_PRODUCER,
          correlationId: meta.correlationId ?? listing.id,
          payload: {
            listingId: listing.id,
            ownerId: listing.ownerId,
            updatedFields,
            updatedAt: listing.updatedAt.toISOString(),
          },
        });
        await this.auditLogService.record(
          {
            identityId,
            operation: 'UpdateMarketplaceListing',
            resource: 'MarketplaceListing',
            resourceId: listing.id,
            result: 'SUCCESS',
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            correlationId: meta.correlationId,
            requestId: meta.requestId,
            metadata: { updatedFields },
          },
          tx,
        );
      });
    }

    this.logger.info(
      {
        operation: 'UpdateMarketplaceListing',
        identityId,
        listingId: listing.id,
        updatedFields,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace listing updated.',
    );

    const images = await this.listingRepository.listImages(listing.id);
    return toListingResponse(listing, {
      category,
      images: images.map((image) => image.url),
      includePublishingHints: true,
    });
  }

  private async currentCategory(categoryId: string | null) {
    return categoryId ? this.listingRepository.findCategoryById(categoryId) : null;
  }
}
