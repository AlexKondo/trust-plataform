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
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  CancelOrderRequest,
  ConfirmOrderRequest,
  ExecutionEvidenceRequest,
  ScheduleOrderRequest,
  cancelOrderRequestSchema,
  confirmOrderRequestSchema,
  executionEvidenceSchema,
  scheduleOrderRequestSchema,
} from '../../application/dto/marketplace-order.dtos';
import { RequestMeta, paginationQuerySchema } from '../../application/dto/marketplace.dtos';
import { ManageOrderUseCase } from '../../application/usecases/manage-order.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const orderIdSchema = z.string().uuid('orderId must be a valid UUID');

/**
 * Ciclo de vida do pedido (MRK-016..022). Não existe endpoint genérico de
 * atualização (MRK-017 §8): cada marco tem sua própria rota e todas passam pelo
 * `OrderLifecycleService`.
 */
@Controller('marketplace/orders')
export class MarketplaceOrderController {
  constructor(private readonly manageOrder: ManageOrderUseCase) {}

  /** Meus pedidos (como comprador ou vendedor). */
  @Get()
  async list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.manageOrder.list(identity.identityId, page, Math.min(size, 50));
  }

  /** MRK-016 — visão consolidada: status, próxima ação, agenda e linha do tempo. */
  @Get(':orderId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.get(identity.identityId, orderId, this.meta(request));
  }

  /** MRK-019 — agenda o serviço (valida conflito na agenda do prestador). */
  @Post(':orderId/schedule')
  @HttpCode(HttpStatus.OK)
  async schedule(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(scheduleOrderRequestSchema)) body: ScheduleOrderRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.schedule(identity.identityId, orderId, body, this.meta(request));
  }

  /** MRK-020 — check-in do prestador; a execução começa. */
  @Post(':orderId/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(executionEvidenceSchema)) body: ExecutionEvidenceRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.start(identity.identityId, orderId, body, this.meta(request));
  }

  /** MRK-021 — check-out do prestador; a bola passa para o cliente. */
  @Post(':orderId/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(executionEvidenceSchema)) body: ExecutionEvidenceRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.completeExecution(
      identity.identityId,
      orderId,
      body,
      this.meta(request),
    );
  }

  /** MRK-022 — confirmação do cliente: dispara score e conclusão do pedido. */
  @Post(':orderId/confirm-completion')
  @HttpCode(HttpStatus.OK)
  async confirmCompletion(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(confirmOrderRequestSchema)) body: ConfirmOrderRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.confirmCompletion(
      identity.identityId,
      orderId,
      body,
      this.meta(request),
    );
  }

  /** MRK-018 — cancelamento com motivo obrigatório; libera o anúncio. */
  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(cancelOrderRequestSchema)) body: CancelOrderRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageOrder.cancel(identity.identityId, orderId, body, this.meta(request));
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
