import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  AuthorizePaymentRequest,
  RequestMeta,
  authorizePaymentRequestSchema,
  paginationQuerySchema,
} from '../../application/dto/payment.dtos';
import { AuthorizePaymentUseCase } from '../../application/usecases/authorize-payment.usecase';
import { GetPaymentUseCase } from '../../application/usecases/get-payment.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const idSchema = z.string().uuid();

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly authorizeUseCase: AuthorizePaymentUseCase,
    private readonly getUseCase: GetPaymentUseCase,
  ) {}

  /** Meus pagamentos (como comprador ou vendedor). */
  @Get()
  async listMine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query('page', new ZodValidationPipe(paginationQuerySchema)) page = 1,
    @Query('size', new ZodValidationPipe(paginationQuerySchema)) size = 20,
  ) {
    return this.getUseCase.listMine(identity.identityId, page, Math.min(size, 50));
  }

  /** Pagamento de um pedido — a tela do pedido consulta por aqui. */
  @Get('by-order/:orderId')
  async getByOrder(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('orderId', new ZodValidationPipe(idSchema)) orderId: string,
  ) {
    return this.getUseCase.getByOrder(identity.identityId, orderId);
  }

  @Get(':paymentId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('paymentId', new ZodValidationPipe(idSchema)) paymentId: string,
  ) {
    return this.getUseCase.get(identity.identityId, paymentId);
  }

  /**
   * PAY-002 — o comprador paga.
   *
   * O header `Idempotency-Key` é o que garante que um clique duplo ou um retry
   * de rede não cobre duas vezes (PAY-ARCH-001 §9). Quando ausente, geramos uma
   * chave por requisição — o cliente perde a proteção, então a API o instrui a
   * enviar. Resposta 200 mesmo em recusa: a requisição foi processada; quem diz
   * se o dinheiro passou é o campo `authorized`.
   */
  @Post(':paymentId/authorize')
  @HttpCode(HttpStatus.OK)
  async authorize(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('paymentId', new ZodValidationPipe(idSchema)) paymentId: string,
    @Body(new ZodValidationPipe(authorizePaymentRequestSchema)) body: AuthorizePaymentRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    return this.authorizeUseCase.execute(
      identity.identityId,
      paymentId,
      idempotencyKey?.trim() || uuidv7(),
      body,
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
