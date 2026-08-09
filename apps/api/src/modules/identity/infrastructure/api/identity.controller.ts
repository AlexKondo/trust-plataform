import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Public } from '../../../../shared/security/public.decorator';
import {
  CreateIdentityRequest,
  createIdentityRequestSchema,
} from '../../application/dto/create-identity.request';
import { CreateIdentityResponse } from '../../application/dto/create-identity.response';
import { CreateIdentityUseCase } from '../../application/usecases/create-identity.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

@Controller('identities')
export class IdentityController {
  constructor(private readonly createIdentityUseCase: CreateIdentityUseCase) {}

  /** IDN-001 — cadastro público; o envelope {success, data} é aplicado pelo interceptor. */
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createIdentityRequestSchema)) body: CreateIdentityRequest,
    @Req() request: RequestWithContext,
  ): Promise<CreateIdentityResponse> {
    return this.createIdentityUseCase.execute(body, {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
