import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { TrustProfileService } from '../../../trust-score/application/usecases/trust-profile.service';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceListingNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import {
  ListingResponse,
  OwnerListingSummaryResponse,
  RequestMeta,
  SellerSummaryResponse,
} from '../dto/marketplace.dtos';
import { excerptOf, toListingResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';

/**
 * MRK-005 — detalhe do anúncio. Público vê só PUBLISHED (BR-001/002) e a
 * reputação do anunciante conforme as Visibility Policies (BR-003/005); o dono
 * vê o próprio anúncio em qualquer status, sem contar visualização.
 */
@Injectable()
export class GetListingUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly passportRepository: TrustPassportRepository,
    private readonly profileService: TrustProfileService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetListingUseCase.name);
  }

  async execute(
    listingId: string,
    viewerId: string | null,
    meta: RequestMeta = {},
  ): Promise<ListingResponse> {
    const listing = await this.listingRepository.findById(listingId);
    if (!listing || listing.deletedAt) {
      throw new MarketplaceListingNotFoundException();
    }

    const isOwner = viewerId !== null && listing.isOwnedBy(viewerId);
    // BR-002: rascunho/removido/suspenso é 404 para quem não é o dono.
    if (!isOwner && !listing.isPubliclyVisible()) {
      throw new MarketplaceListingNotFoundException();
    }

    const [category, images] = await Promise.all([
      listing.categoryId ? this.listingRepository.findCategoryById(listing.categoryId) : null,
      this.listingRepository.listImages(listing.id),
    ]);

    if (!isOwner) {
      await this.registerView(listing, viewerId, meta);
    }

    const seller = isOwner ? null : await this.buildSellerSummary(listing.ownerId);

    return toListingResponse(listing, {
      category,
      images: images.map((image) => image.url),
      seller,
      includePublishingHints: isOwner,
    });
  }

  /** MRK-001/002 — vitrine do dono: inclui rascunhos (não aparecem na busca). */
  async listMine(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<OwnerListingSummaryResponse>> {
    const { items, totalItems } = await this.listingRepository.findByOwner(
      identityId,
      page,
      pageSize,
    );
    const categories = await this.listingRepository.listCategories(false);
    const byId = new Map(categories.map((category) => [category.id, category]));

    return PaginatedResult.of(
      items.map((listing) => {
        const category = listing.categoryId ? byId.get(listing.categoryId) : undefined;
        return {
          listingId: listing.id,
          title: listing.title,
          excerpt: excerptOf(listing.description),
          listingType: listing.listingType,
          category: category?.code ?? null,
          categoryName: category?.name ?? null,
          price: listing.price,
          currency: listing.currency,
          location: listing.location,
          imageUrl: null,
          publishedAt: listing.publishedAt?.toISOString() ?? null,
          viewCount: listing.viewCount,
          status: listing.status,
          missingFields: listing.missingRequiredFields(),
          seller: { trustScore: null, trustLevel: null },
        } satisfies OwnerListingSummaryResponse;
      }),
      page,
      pageSize,
      totalItems,
    );
  }

  /** BR-004/BR-007 — contador, evento e auditoria da visualização. */
  private async registerView(
    listing: MarketplaceListing,
    viewerId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    const viewedAt = new Date();
    try {
      await this.db.transaction(async (tx) => {
        await this.listingRepository.incrementViewCount(listing.id, viewedAt, tx);
        await this.outboxService.enqueue(tx, {
          eventType: 'MarketplaceListing.Viewed',
          aggregateType: 'MarketplaceListing',
          aggregateId: listing.id,
          producer: MRK_PRODUCER,
          correlationId: meta.correlationId ?? listing.id,
          payload: {
            listingId: listing.id,
            viewerId,
            viewedAt: viewedAt.toISOString(),
          },
        });
        await this.auditLogService.record(
          {
            identityId: viewerId ?? undefined,
            operation: 'ViewMarketplaceListing',
            resource: 'MarketplaceListing',
            resourceId: listing.id,
            result: 'SUCCESS',
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            correlationId: meta.correlationId,
            requestId: meta.requestId,
          },
          tx,
        );
      });
      listing.registerView(viewedAt);
    } catch (error) {
      // Visualização é leitura: falha de contagem não pode derrubar a consulta.
      this.logger.error(
        { err: error, listingId: listing.id, correlationId: meta.correlationId },
        'Failed to register marketplace listing view.',
      );
    }
  }

  private async buildSellerSummary(ownerId: string): Promise<SellerSummaryResponse | null> {
    const passport = await this.passportRepository.findByIdentityId(ownerId);
    if (!passport) {
      return null;
    }
    const profile = await this.profileService.buildByPassportId(passport.id, 'PUBLIC_VIEW');
    return {
      displayName: profile.displayName,
      trustLevel: profile.level,
      trustScore: profile.score,
      badges: profile.badges?.map((badge) => ({ code: badge.code, name: badge.name })) ?? null,
      verifications: profile.verifications,
      memberSince: profile.memberSince,
    };
  }
}
