import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { Public } from '../../../../shared/security/public.decorator';
import {
  CreateIdentityRequest,
  createIdentityRequestSchema,
} from '../../application/dto/create-identity.request';
import { CreateIdentityResponse } from '../../application/dto/create-identity.response';
import { GetCurrentIdentityResponse } from '../../application/dto/get-current-identity.response';
import { CreateIdentityUseCase, RequestMetadata } from '../../application/usecases/create-identity.usecase';
import { GenerateEmailVerificationUseCase } from '../../application/usecases/generate-email-verification.usecase';
import { GetCurrentIdentityUseCase } from '../../application/usecases/get-current-identity.usecase';
import {
  VerifyEmailResponse,
  VerifyEmailUseCase,
} from '../../application/usecases/verify-email.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const verifyEmailTokenSchema = z
  .string({ required_error: 'token is required' })
  .min(20, 'token is malformed')
  .max(255);

const identityIdSchema = z.string().uuid('identityId must be a valid UUID');

@Controller('identities')
export class IdentityController {
  constructor(
    private readonly createIdentityUseCase: CreateIdentityUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly generateEmailVerificationUseCase: GenerateEmailVerificationUseCase,
    private readonly getCurrentIdentityUseCase: GetCurrentIdentityUseCase,
  ) {}

  /** IDN-005 — dados da Identity autenticada (rota protegida pelo guard global). */
  @Get('me')
  async getCurrentIdentity(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<GetCurrentIdentityResponse> {
    return this.getCurrentIdentityUseCase.execute(identity.identityId);
  }

  /** IDN-001 — cadastro público; o envelope {success, data} é aplicado pelo interceptor. */
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createIdentityRequestSchema)) body: CreateIdentityRequest,
    @Req() request: RequestWithContext,
  ): Promise<CreateIdentityResponse> {
    return this.createIdentityUseCase.execute(body, this.metadataFrom(request));
  }

  /** IDN-002 — confirma o e-mail via link (público). */
  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Query('token', new ZodValidationPipe(verifyEmailTokenSchema)) token: string,
    @Req() request: RequestWithContext,
  ): Promise<VerifyEmailResponse> {
    return this.verifyEmailUseCase.execute(token, this.metadataFrom(request));
  }

  /** IDN-002 — reenvio do e-mail de verificação (público; 202 sem corpo de dados). */
  @Public()
  @Post(':identityId/verify-email')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(
    @Param('identityId', new ZodValidationPipe(identityIdSchema)) identityId: string,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    await this.generateEmailVerificationUseCase.execute(identityId, this.metadataFrom(request));
  }

  private metadataFrom(request: RequestWithContext): RequestMetadata {
    return {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
