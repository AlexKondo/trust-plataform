import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  TrustPassportResponse,
  UpdateTrustPassportRequest,
  UpdateTrustPassportResponse,
  updateTrustPassportRequestSchema,
} from '../../application/dto/trust-passport.dtos';
import { CreateTrustPassportUseCase } from '../../application/usecases/create-trust-passport.usecase';
import { GetTrustPassportUseCase } from '../../application/usecases/get-trust-passport.usecase';
import { UpdateTrustPassportUseCase } from '../../application/usecases/update-trust-passport.usecase';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

/** Rotas protegidas pelo guard global; ownership vem sempre do token (anti-IDOR). */
@Controller('trust-passports')
export class TrustPassportController {
  constructor(
    private readonly createUseCase: CreateTrustPassportUseCase,
    private readonly getUseCase: GetTrustPassportUseCase,
    private readonly updateUseCase: UpdateTrustPassportUseCase,
  ) {}

  /** TPS-001 — criação explícita (fallback; o caminho normal é o consumer). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: RequestWithContext,
  ): Promise<{ trustPassportId: string; status: string }> {
    const result = await this.createUseCase.execute(identity.identityId, {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return { trustPassportId: result.trustPassportId, status: result.status };
  }

  /** TPS-002 — consulta do próprio Passport. */
  @Get('me')
  async getMine(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<TrustPassportResponse> {
    return this.getUseCase.execute(identity.identityId);
  }

  /** TPS-003 — atualização dos atributos EDITABLE. */
  @Put('me')
  async updateMine(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(updateTrustPassportRequestSchema)) body: UpdateTrustPassportRequest,
    @Req() request: RequestWithContext,
  ): Promise<UpdateTrustPassportResponse> {
    return this.updateUseCase.execute(identity.identityId, body, {
      correlationId: request.requestContext?.correlationId,
      requestId: request.requestContext?.requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
