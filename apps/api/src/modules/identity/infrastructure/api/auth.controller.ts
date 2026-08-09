import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { Public } from '../../../../shared/security/public.decorator';
import { LoginRequest, loginRequestSchema } from '../../application/dto/login.request';
import { LoginResponse } from '../../application/dto/login.response';
import {
  RefreshSessionRequest,
  refreshSessionRequestSchema,
} from '../../application/dto/refresh-session.request';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
} from '../../application/dto/password.requests';
import { AuthenticateIdentityUseCase } from '../../application/usecases/authenticate-identity.usecase';
import { ChangePasswordUseCase } from '../../application/usecases/change-password.usecase';
import {
  ForgotPasswordResponse,
  ForgotPasswordUseCase,
} from '../../application/usecases/forgot-password.usecase';
import { LogoutUseCase } from '../../application/usecases/logout.usecase';
import { RefreshSessionUseCase } from '../../application/usecases/refresh-session.usecase';
import { ResetPasswordUseCase } from '../../application/usecases/reset-password.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authenticateIdentityUseCase: AuthenticateIdentityUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  /** IDN-003 — login com e-mail e senha (público; 200 com tokens). */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: RequestWithContext,
  ): Promise<LoginResponse> {
    return this.authenticateIdentityUseCase.execute(body, this.metadataFrom(request));
  }

  /** IDN-004 — renova a sessão rotacionando o refresh token (público). */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSessionRequestSchema)) body: RefreshSessionRequest,
    @Req() request: RequestWithContext,
  ): Promise<LoginResponse> {
    return this.refreshSessionUseCase.execute(body, this.metadataFrom(request));
  }

  /** IDN-006 — encerra APENAS a sessão atual (rota protegida; 204 sem corpo). */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    await this.logoutUseCase.execute(identity.tokenId, this.metadataFrom(request));
  }

  /** IDN-007 — inicia recuperação de senha (público; 202 SEMPRE, anti-enumeração). */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() request: RequestWithContext,
  ): Promise<ForgotPasswordResponse> {
    return this.forgotPasswordUseCase.execute(body, this.metadataFrom(request));
  }

  /** IDN-008 — redefine a senha com token de recuperação (público; revoga TODAS as sessões). */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    await this.resetPasswordUseCase.execute(body, this.metadataFrom(request));
  }

  /** IDN-009 — troca de senha autenticada (revoga as demais sessões; mantém a atual). */
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    await this.changePasswordUseCase.execute(identity, body, this.metadataFrom(request));
  }

  private metadataFrom(request: RequestWithContext) {
    return {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }
}
