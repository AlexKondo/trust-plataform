import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ValidationException } from '../../../../shared/api/validation.exception';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { RequestMeta } from '../../application/dto/marketplace.dtos';
import {
  CreateChangeOrderRequest,
  PauseExecutionRequest,
  RejectChangeOrderRequest,
  changeOrderEvidenceTypeSchema,
  createChangeOrderRequestSchema,
  pauseExecutionRequestSchema,
  rejectChangeOrderRequestSchema,
} from '../../application/dto/trust-change-order.dtos';
import { ManageChangeOrderUseCase } from '../../application/usecases/manage-change-order.usecase';
import { ServiceExecutionUseCase } from '../../application/usecases/service-execution.usecase';
import { ChangeOrderEvidenceTooLargeException } from '../../domain/exceptions/marketplace.exceptions';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const orderIdSchema = z.string().uuid('orderId must be a valid UUID');
const changeOrderIdSchema = z.string().uuid('changeOrderId must be a valid UUID');

/**
 * PACK-03 §21 — mudança comercial e tempo de execução.
 *
 * O check-in e o check-out continuam onde sempre estiveram
 * (`MarketplaceOrderController`, MRK-020/021): o Pack não duplica endpoint que
 * já existe. Aqui entram só as capacidades novas — Change Order, pausa/retomada
 * e o Service Summary.
 */
@Controller('marketplace')
export class MarketplaceChangeOrderController {
  constructor(
    private readonly manageChangeOrder: ManageChangeOrderUseCase,
    private readonly serviceExecution: ServiceExecutionUseCase,
  ) {}

  /** §7 — o Trust Partner rascunha a mudança. Rascunho não cobra nada. */
  @Post('orders/:orderId/change-orders')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(createChangeOrderRequestSchema)) body: CreateChangeOrderRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageChangeOrder.create(identity.identityId, orderId, body, this.meta(request));
  }

  /** §21 — todas as mudanças do contrato, para as duas partes. */
  @Get('orders/:orderId/change-orders')
  async listByOrder(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
  ) {
    return this.manageChangeOrder.listByOrder(identity.identityId, orderId);
  }

  @Get('change-orders/:changeOrderId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
  ) {
    return this.manageChangeOrder.get(identity.identityId, changeOrderId);
  }

  /** §6.1 — vai para a mesa do Trust Member. */
  @Post('change-orders/:changeOrderId/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.manageChangeOrder.submit(identity.identityId, changeOrderId, this.meta(request));
  }

  /** §6.1/§12 — só o Trust Member aprova, e só aqui o valor autorizado sobe. */
  @Post('change-orders/:changeOrderId/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.manageChangeOrder.approve(identity.identityId, changeOrderId, this.meta(request));
  }

  @Post('change-orders/:changeOrderId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
    @Body(new ZodValidationPipe(rejectChangeOrderRequestSchema)) body: RejectChangeOrderRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.manageChangeOrder.reject(
      identity.identityId,
      changeOrderId,
      body,
      this.meta(request),
    );
  }

  /** §6.1 — quem propôs retira, enquanto não houver decisão. */
  @Post('change-orders/:changeOrderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.manageChangeOrder.cancel(identity.identityId, changeOrderId, this.meta(request));
  }

  /** §13 — evidência (multipart: campo `type` + arquivo `file`), como no VRF-002. */
  @Post('change-orders/:changeOrderId/evidences')
  @HttpCode(HttpStatus.CREATED)
  async submitEvidence(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('changeOrderId', new ZodValidationPipe(changeOrderIdSchema)) changeOrderId: string,
    @Req() request: RequestWithContext,
  ) {
    const file = await request.file().catch(() => null);
    if (!file) {
      throw new ValidationException(
        new z.ZodError([
          { code: 'custom', path: ['file'], message: 'multipart file field "file" is required' },
        ]),
      );
    }
    const typeField = file.fields.type;
    const rawType =
      typeField && 'value' in typeField ? String((typeField as { value: unknown }).value) : '';
    const parsedType = changeOrderEvidenceTypeSchema.safeParse(rawType);
    if (!parsedType.success) {
      throw new ValidationException(parsedType.error);
    }

    let content: Buffer;
    try {
      content = await file.toBuffer();
    } catch {
      throw new ChangeOrderEvidenceTooLargeException(0);
    }

    return this.manageChangeOrder.uploadEvidence(
      identity.identityId,
      {
        changeOrderId,
        evidenceType: parsedType.data,
        fileName: file.filename ?? 'evidence',
        mimeType: file.mimetype,
        content,
      },
      this.meta(request),
    );
  }

  /** §10.2 — Trust Pause: o relógio faturável para. */
  @Post('orders/:orderId/pause')
  @HttpCode(HttpStatus.OK)
  async pause(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Body(new ZodValidationPipe(pauseExecutionRequestSchema)) body: PauseExecutionRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.serviceExecution.pause(identity.identityId, orderId, body, this.meta(request));
  }

  /** §10.3 — Trust Resume. */
  @Post('orders/:orderId/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.serviceExecution.resume(identity.identityId, orderId, this.meta(request));
  }

  /** §15 — "o que contratei + o que aprovei depois = o total". */
  @Get('orders/:orderId/service-summary')
  async serviceSummary(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(orderIdSchema)) orderId: string,
    @Req() request: RequestWithContext,
  ) {
    return this.serviceExecution.getServiceSummary(
      identity.identityId,
      orderId,
      this.meta(request),
    );
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
