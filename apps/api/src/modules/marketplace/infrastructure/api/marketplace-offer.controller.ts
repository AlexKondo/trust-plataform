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
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  CounterOfferRequest,
  CreateOfferRequest,
  OfferReasonRequest,
  UpdateOfferRequest,
  counterOfferRequestSchema,
  createOfferRequestSchema,
  offerReasonRequestSchema,
  updateOfferRequestSchema,
} from '../../application/dto/marketplace-offer.dtos';
import { RequestMeta, paginationQuerySchema } from '../../application/dto/marketplace.dtos';
import { AcceptOfferUseCase } from '../../application/usecases/accept-offer.usecase';
import { CounterOfferUseCase } from '../../application/usecases/counter-offer.usecase';
import { CreateOfferUseCase } from '../../application/usecases/create-offer.usecase';
import { GetOffersUseCase } from '../../application/usecases/get-offers.usecase';
import {
  RejectOfferUseCase,
  WithdrawOfferUseCase,
} from '../../application/usecases/resolve-offer.usecase';
import { UpdateOfferUseCase } from '../../application/usecases/update-offer.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const idSchema = z.string().uuid();

/**
 * Propostas e pedidos (MRK-009..015). Rotas de conversa e de proposta convivem
 * aqui porque compartilham o mesmo agregado de negociação.
 */
@Controller('marketplace')
export class MarketplaceOfferController {
  constructor(
    private readonly createUseCase: CreateOfferUseCase,
    private readonly updateUseCase: UpdateOfferUseCase,
    private readonly withdrawUseCase: WithdrawOfferUseCase,
    private readonly counterUseCase: CounterOfferUseCase,
    private readonly acceptUseCase: AcceptOfferUseCase,
    private readonly rejectUseCase: RejectOfferUseCase,
    private readonly getUseCase: GetOffersUseCase,
  ) {}

  /** MRK-009 — comprador envia proposta na conversa. */
  @Post('conversations/:conversationId/offers')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(idSchema)) conversationId: string,
    @Body(new ZodValidationPipe(createOfferRequestSchema)) body: CreateOfferRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.createUseCase.execute(
      identity.identityId,
      conversationId,
      body,
      this.meta(request),
    );
  }

  /** MRK-012 §6.2 — histórico completo da negociação (cadeia de propostas). */
  @Get('conversations/:conversationId/offers')
  async listByConversation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('conversationId', new ZodValidationPipe(idSchema)) conversationId: string,
  ) {
    return this.getUseCase.listByConversation(identity.identityId, conversationId);
  }

  /** Meus pedidos — o ciclo de vida completo chega no Módulo 8. */
  @Get('orders')
  async listOrders(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.getUseCase.listMyOrders(identity.identityId, page, Math.min(size, 50));
  }

  @Get('orders/:orderId')
  async getOrder(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ) {
    return this.getUseCase.getOrder(identity.identityId, orderId);
  }

  @Get('offers/:offerId')
  async getOffer(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
  ) {
    return this.getUseCase.getOffer(identity.identityId, offerId);
  }

  /** MRK-010 — autor ajusta a proposta pendente. */
  @Put('offers/:offerId')
  async update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
    @Body(new ZodValidationPipe(updateOfferRequestSchema)) body: UpdateOfferRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.updateUseCase.execute(identity.identityId, offerId, body, this.meta(request));
  }

  /** MRK-011 — autor retira a proposta. */
  @Post('offers/:offerId/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
    @Body(new ZodValidationPipe(offerReasonRequestSchema)) body: OfferReasonRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.withdrawUseCase.execute(identity.identityId, offerId, body, this.meta(request));
  }

  /** MRK-012 — quem recebeu responde com contraoferta (a anterior vira COUNTERED). */
  @Post('offers/:offerId/counter')
  @HttpCode(HttpStatus.CREATED)
  async counter(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
    @Body(new ZodValidationPipe(counterOfferRequestSchema)) body: CounterOfferRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.counterUseCase.execute(identity.identityId, offerId, body, this.meta(request));
  }

  /** MRK-013 — aceite: encerra a negociação, reserva o anúncio e cria o pedido. */
  @Post('offers/:offerId/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.acceptUseCase.execute(identity.identityId, offerId, this.meta(request));
  }

  /** MRK-014 — rejeição; a conversa continua aberta para novas rodadas. */
  @Post('offers/:offerId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('offerId', new ZodValidationPipe(idSchema)) offerId: string,
    @Body(new ZodValidationPipe(offerReasonRequestSchema)) body: OfferReasonRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.rejectUseCase.execute(identity.identityId, offerId, body, this.meta(request));
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
