import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { JwtTokenService } from '../../../../shared/security/jwt-token.service';
import { resolveOptionalIdentity } from '../../../../shared/security/optional-identity';
import { Public } from '../../../../shared/security/public.decorator';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import {
  ContactListingOwnerRequest,
  CreateListingRequest,
  RequestMeta,
  SearchListingsQuery,
  UpdateListingRequest,
  contactListingOwnerRequestSchema,
  createListingRequestSchema,
  paginationQuerySchema,
  searchListingsQuerySchema,
  updateListingRequestSchema,
} from '../../application/dto/marketplace.dtos';
import { ContactListingOwnerUseCase } from '../../application/usecases/contact-listing-owner.usecase';
import { CreateListingUseCase } from '../../application/usecases/create-listing.usecase';
import { GetListingUseCase } from '../../application/usecases/get-listing.usecase';
import { PublishListingUseCase } from '../../application/usecases/publish-listing.usecase';
import { SearchListingsUseCase } from '../../application/usecases/search-listings.usecase';
import { UpdateListingUseCase } from '../../application/usecases/update-listing.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const listingIdSchema = z.string().uuid('listingId must be a valid UUID');

@Controller('marketplace/listings')
export class MarketplaceListingController {
  constructor(
    private readonly createUseCase: CreateListingUseCase,
    private readonly updateUseCase: UpdateListingUseCase,
    private readonly publishUseCase: PublishListingUseCase,
    private readonly searchUseCase: SearchListingsUseCase,
    private readonly getUseCase: GetListingUseCase,
    private readonly contactUseCase: ContactListingOwnerUseCase,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  /** MRK-004 — busca pública (declarada antes de `:listingId` para não colidir). */
  @Public()
  @Get()
  async search(
    @Query(new ZodValidationPipe(searchListingsQuerySchema)) query: SearchListingsQuery,
    @Req() request: RequestWithContext,
  ) {
    return this.searchUseCase.execute(query, this.meta(request));
  }

  /** Catálogo de categorias e seus requisitos de reputação (MRK-001/003). */
  @Public()
  @Get('categories')
  async categories() {
    const categories = await this.listingRepository.listCategories(true);
    return categories.map((category) => ({
      code: category.code,
      name: category.name,
      description: category.description,
      minimumTrustLevel: category.minimumTrustLevel,
      minimumScore: category.minimumScore,
    }));
  }

  /** Vitrine do dono — inclui rascunhos e o que falta para publicar. */
  @Get('mine')
  async mine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.getUseCase.listMine(identity.identityId, page, Math.min(size, 50));
  }

  /** MRK-001 — cria o anúncio (nasce em DRAFT). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createListingRequestSchema)) body: CreateListingRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.createUseCase.execute(identity.identityId, body, this.meta(request));
  }

  /** MRK-002 — atualiza (só o dono). */
  @Put(':listingId')
  async update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('listingId', new ZodValidationPipe(listingIdSchema)) listingId: string,
    @Body(new ZodValidationPipe(updateListingRequestSchema)) body: UpdateListingRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.updateUseCase.execute(identity.identityId, listingId, body, this.meta(request));
  }

  /** MRK-003 — publica (exige conta ativa e reputação mínima da categoria). */
  @Post(':listingId/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('listingId', new ZodValidationPipe(listingIdSchema)) listingId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.publishUseCase.execute(identity.identityId, listingId, this.meta(request));
  }

  /** MRK-005 — detalhe. Público; se houver token válido, o dono vê o rascunho. */
  @Public()
  @Get(':listingId')
  async get(
    @Param('listingId', new ZodValidationPipe(listingIdSchema)) listingId: string,
    @Req() request: RequestWithContext,
  ) {
    const viewerId = resolveOptionalIdentity(request, this.jwtTokenService);
    return this.getUseCase.execute(listingId, viewerId, this.meta(request));
  }

  /**
   * MRK-006 — "Entrar em contato". 201 quando abre a conversa; 200 quando
   * reaproveita uma conversa ativa (INCONSISTENCIAS #9).
   */
  @Post(':listingId/contact')
  async contact(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('listingId', new ZodValidationPipe(listingIdSchema)) listingId: string,
    @Body(new ZodValidationPipe(contactListingOwnerRequestSchema)) body: ContactListingOwnerRequest,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.contactUseCase.execute(
      identity.identityId,
      listingId,
      body,
      this.meta(request),
    );
    reply.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { conversation: result.conversation, message: result.message, created: result.created };
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
