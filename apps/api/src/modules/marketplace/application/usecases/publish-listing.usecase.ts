import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import {
  MarketplaceListingIncompleteException,
  MarketplaceListingNotFoundException,
  MarketplaceListingOwnershipException,
  MarketplacePublicationNotAllowedException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { assertPublicationAllowed } from '../../domain/services/marketplace-publication.service';
import { ListingResponse, RequestMeta } from '../dto/marketplace.dtos';
import { toListingResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';

/**
 * MRK-003 — publica o anúncio. É aqui que o Trust Layer vira porteiro: conta
 * ativa (BR-004) e reputação mínima da categoria (BR-005) são pré-requisitos.
 */
@Injectable()
export class PublishListingUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly trustScoreRepository: TrustScoreRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PublishListingUseCase.name);
  }

  async execute(
    identityId: string,
    listingId: string,
    meta: RequestMeta = {},
  ): Promise<ListingResponse> {
    const listing = await this.listingRepository.findById(listingId);
    if (!listing || listing.deletedAt) {
      throw new MarketplaceListingNotFoundException();
    }
    if (!listing.isOwnedBy(identityId)) {
      throw new MarketplaceListingOwnershipException();
    }

    // BR-003 antes da elegibilidade: falta de dado é erro do anúncio, não do dono.
    const missing = listing.missingRequiredFields();
    if (missing.length > 0) {
      throw new MarketplaceListingIncompleteException(missing);
    }

    const category = await this.listingRepository.findCategoryById(listing.categoryId!);
    if (!category) {
      throw new MarketplaceListingIncompleteException(['categoryId']);
    }

    const [identity, score, levelRules] = await Promise.all([
      this.identityRepository.findById(identityId),
      this.trustScoreRepository.findScoreByIdentityId(identityId),
      this.trustScoreRepository.listLevelRules(),
    ]);
    if (!identity) {
      throw new MarketplacePublicationNotAllowedException('Identity not found.');
    }

    try {
      assertPublicationAllowed({
        identityStatus: identity.status,
        score: score?.score ?? 0,
        level: score?.level ?? 'UNVERIFIED',
        levelRanks: new Map(levelRules.map((rule) => [rule.level, rule.rank])),
        category,
      });
    } catch (error) {
      await this.auditLogService.recordSafe({
        identityId,
        operation: 'PublishMarketplaceListing',
        resource: 'MarketplaceListing',
        resourceId: listing.id,
        result: 'DENIED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        metadata: {
          category: category.code,
          requiredTrustLevel: category.minimumTrustLevel,
          currentLevel: score?.level ?? 'UNVERIFIED',
        },
      });
      throw error;
    }

    const previousStatus = listing.status;
    listing.publish();

    await this.db.transaction(async (tx) => {
      await this.listingRepository.save(listing, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceListing.Published',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? listing.id,
        payload: {
          listingId: listing.id,
          ownerId: listing.ownerId,
          category: category.code,
          status: listing.status,
          publishedAt: listing.publishedAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'PublishMarketplaceListing',
          resource: 'MarketplaceListing',
          resourceId: listing.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { previousStatus, newStatus: listing.status, category: category.code },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'PublishMarketplaceListing',
        identityId,
        listingId: listing.id,
        previousStatus,
        newStatus: listing.status,
        publishedAt: listing.publishedAt?.toISOString(),
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace listing published.',
    );

    const images = await this.listingRepository.listImages(listing.id);
    return toListingResponse(listing, {
      category,
      images: images.map((image) => image.url),
      includePublishingHints: true,
    });
  }
}
