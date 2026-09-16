import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { RequestMeta, paginationQuerySchema } from '../../application/dto/marketplace.dtos';
import {
  CancelServiceRequestRequest,
  CloseServiceRequestRequest,
  CreateServiceRequestRequest,
  DiscoverMatchesQuery,
  EngageServiceRequestRequest,
  cancelServiceRequestRequestSchema,
  closeServiceRequestRequestSchema,
  createServiceRequestRequestSchema,
  discoverMatchesQuerySchema,
  engageServiceRequestRequestSchema,
} from '../../application/dto/service-request.dtos';
import { CancelServiceRequestUseCase, CloseServiceRequestUseCase } from '../../application/usecases/resolve-service-request.usecase';
import { CreateServiceRequestUseCase } from '../../application/usecases/create-service-request.usecase';
import { DiscoverServiceRequestMatchesUseCase } from '../../application/usecases/discover-service-request-matches.usecase';
import { EngageServiceRequestUseCase } from '../../application/usecases/engage-service-request.usecase';
import { GetServiceRequestUseCase } from '../../application/usecases/get-service-request.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const serviceRequestIdSchema = z.string().uuid('serviceRequestId must be a valid UUID');

/**
 * IP-003 — rotas do pedido de serviço do Trust Member. Todas exigem
 * autenticação e são sempre restritas ao dono (`ServiceRequestNotFoundException`
 * para qualquer outro identityId — ver §11/§16 do Completion Report): ao
 * contrário de `marketplace/listings`, não existe aqui nenhuma rota `@Public()`.
 */
@Controller('marketplace/service-requests')
export class MarketplaceServiceRequestController {
  constructor(
    private readonly createUseCase: CreateServiceRequestUseCase,
    private readonly getUseCase: GetServiceRequestUseCase,
    private readonly discoverMatchesUseCase: DiscoverServiceRequestMatchesUseCase,
    private readonly engageUseCase: EngageServiceRequestUseCase,
    private readonly closeUseCase: CloseServiceRequestUseCase,
    private readonly cancelUseCase: CancelServiceRequestUseCase,
  ) {}

  /** IP-003 — Member descreve a necessidade. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createServiceRequestRequestSchema)) body: CreateServiceRequestRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.createUseCase.execute(identity.identityId, body, this.meta(request));
  }

  /** Meus pedidos de serviço. */
  @Get('mine')
  async mine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.getUseCase.listMine(identity.identityId, page, Math.min(size, 50));
  }

  /** Detalhe — sempre privado ao dono (404 para qualquer outro identityId). */
  @Get(':serviceRequestId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('serviceRequestId', new ZodValidationPipe(serviceRequestIdSchema)) serviceRequestId: string,
  ) {
    return this.getUseCase.execute(identity.identityId, serviceRequestId);
  }

  /**
   * IP-003 — fundação de matching determinístico (categoria + localização em
   * texto + nível mínimo de confiança), sem IA. Devolve anúncios PUBLISHED
   * elegíveis, na forma de resumo do MRK-004 (ver toServiceRequestMatch).
   */
  @Get(':serviceRequestId/matches')
  async matches(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('serviceRequestId', new ZodValidationPipe(serviceRequestIdSchema)) serviceRequestId: string,
    @Query(new ZodValidationPipe(discoverMatchesQuerySchema)) query: DiscoverMatchesQuery,
  ) {
    return this.discoverMatchesUseCase.execute(identity.identityId, serviceRequestId, query.page, query.size);
  }

  /**
   * IP-003 — Member engaja um Partner elegível: cria/reaproveita a conversa
   * (mesmo mecanismo do MRK-006) e liga essa conversa a este pedido. 201 no
   * primeiro engajamento com este anúncio; 200 ao reaproveitar (mesma
   * convenção do `POST /marketplace/listings/{listingId}/contact`).
   */
  @Post(':serviceRequestId/engage')
  async engage(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('serviceRequestId', new ZodValidationPipe(serviceRequestIdSchema)) serviceRequestId: string,
    @Body(new ZodValidationPipe(engageServiceRequestRequestSchema)) body: EngageServiceRequestRequest,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.engageUseCase.execute(identity.identityId, serviceRequestId, body, this.meta(request));
    reply.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Post(':serviceRequestId/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('serviceRequestId', new ZodValidationPipe(serviceRequestIdSchema)) serviceRequestId: string,
    @Body(new ZodValidationPipe(closeServiceRequestRequestSchema)) body: CloseServiceRequestRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.closeUseCase.execute(identity.identityId, serviceRequestId, body, this.meta(request));
  }

  @Post(':serviceRequestId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('serviceRequestId', new ZodValidationPipe(serviceRequestIdSchema)) serviceRequestId: string,
    @Body(new ZodValidationPipe(cancelServiceRequestRequestSchema)) body: CancelServiceRequestRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.cancelUseCase.execute(identity.identityId, serviceRequestId, body, this.meta(request));
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
