import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { Public } from '../../../../shared/security/public.decorator';
import { LoginRequest, loginRequestSchema } from '../../application/dto/login.request';
import { LoginResponse } from '../../application/dto/login.response';
import { AuthenticateIdentityUseCase } from '../../application/usecases/authenticate-identity.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

@Controller('auth')
export class AuthController {
  constructor(private readonly authenticateIdentityUseCase: AuthenticateIdentityUseCase) {}

  /** IDN-003 — login com e-mail e senha (público; 200 com tokens). */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: RequestWithContext,
  ): Promise<LoginResponse> {
    return this.authenticateIdentityUseCase.execute(body, {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
