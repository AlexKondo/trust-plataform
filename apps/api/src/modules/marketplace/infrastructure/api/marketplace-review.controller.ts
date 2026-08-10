import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import {
  CreateReviewRequest,
  OpenDisputeRequest,
  ResolveDisputeRequest,
  createReviewRequestSchema,
  openDisputeRequestSchema,
  resolveDisputeRequestSchema,
} from '../../application/dto/marketplace-review.dtos';
import { RequestMeta, paginationQuerySchema } from '../../application/dto/marketplace.dtos';
import { ManageDisputeUseCase } from '../../application/usecases/manage-dispute.usecase';
import { ReviewTransactionUseCase } from '../../application/usecases/review-transaction.usecase';
import {
  DISPUTE_CATEGORIES,
  DECISION_TYPES,
} from '../../domain/entities/marketplace-dispute';
import { REVIEW_CRITERIA } from '../../domain/entities/marketplace-review';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const idSchema = z.string().uuid();

/** Disputas e avaliações (MRK-023..025) — o fecho do ciclo de reputação. */
@Controller('marketplace')
export class MarketplaceReviewController {
  constructor(
    private readonly disputes: ManageDisputeUseCase,
    private readonly reviews: ReviewTransactionUseCase,
    private readonly identityRepository: IdentityRepository,
  ) {}

  /** Catálogos de disputa e avaliação (MRK-023 BR-004 / MRK-025 BR-005). */
  @Get('review-catalog')
  catalog() {
    return {
      disputeCategories: DISPUTE_CATEGORIES,
      decisionTypes: DECISION_TYPES,
      reviewCriteria: REVIEW_CRITERIA,
    };
  }

  // ── Disputas ───────────────────────────────────────────────────────────────
  /** MRK-023 — abrir disputa (comprador ou vendedor). */
  @Post('orders/:orderId/disputes')
  @HttpCode(HttpStatus.CREATED)
  async openDispute(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(openDisputeRequestSchema)) body: OpenDisputeRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.disputes.open(identity.identityId, orderId, body, this.meta(request));
  }

  @Get('orders/:orderId/disputes')
  async listOrderDisputes(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ) {
    return this.disputes.listByOrder(identity.identityId, orderId);
  }

  @Get('disputes/:disputeId')
  async getDispute(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('disputeId', new ZodValidationPipe(idSchema)) disputeId: string,
  ) {
    const identityRow = await this.identityRepository.findById(identity.identityId);
    return this.disputes.get(identity.identityId, disputeId, identityRow?.isAdmin ?? false);
  }

  /** MRK-024 — decidir a disputa (ADMIN/mediador; BR-001). */
  @Post('disputes/:disputeId/resolve')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async resolveDispute(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('disputeId', new ZodValidationPipe(idSchema)) disputeId: string,
    @Body(new ZodValidationPipe(resolveDisputeRequestSchema)) body: ResolveDisputeRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.disputes.resolve(identity.identityId, disputeId, body, this.meta(request));
  }

  // ── Avaliações ─────────────────────────────────────────────────────────────
  /** MRK-025 — avaliar a transação. */
  @Post('orders/:orderId/reviews')
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
    @Body(new ZodValidationPipe(createReviewRequestSchema)) body: CreateReviewRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.reviews.create(identity.identityId, orderId, body, this.meta(request));
  }

  @Get('orders/:orderId/reviews')
  async listOrderReviews(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ) {
    return this.reviews.listByOrder(identity.identityId, orderId);
  }

  /** Avaliações que recebi + consolidado (média e taxa de recomendação). */
  @Get('reviews/received')
  async listReceived(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.reviews.listReceived(identity.identityId, page, Math.min(size, 50));
  }

  @Get('reviews/summary')
  async summary(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.reviews.summary(identity.identityId);
  }

  private meta(request: RequestWithContext): RequestMeta {
    return {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}

/** Fila de mediação (ADMIN) — separada para não colidir com as rotas públicas. */
@Controller('admin/marketplace')
@UseGuards(AdminGuard)
export class MarketplaceDisputeAdminController {
  constructor(private readonly disputes: ManageDisputeUseCase) {}

  @Get('disputes')
  async listActive(
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.disputes.listActive(page, Math.min(size, 50));
  }
}
