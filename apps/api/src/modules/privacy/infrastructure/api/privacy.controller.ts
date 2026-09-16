import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  CreatePrivacyRequestBody,
  PrivacyRequestResponse,
  RequestMeta,
  createPrivacyRequestSchema,
} from '../../application/dto/privacy.dtos';
import { GetPrivacyRequestsUseCase } from '../../application/usecases/get-privacy-requests.usecase';
import { RequestDataDeletionUseCase } from '../../application/usecases/request-data-deletion.usecase';
import { RequestDataExportUseCase } from '../../application/usecases/request-data-export.usecase';
import { PRIVACY_REQUEST_TYPE } from '../../domain/entities/privacy-request';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const requestIdSchema = z.string().uuid('requestId must be a valid UUID');

/**
 * IP-021 — fundação do workflow de acesso/exclusão de dados (LGPD art. 18).
 * Sempre auto-serviço, escopado ao token do próprio titular — não existe
 * rota administrativa para solicitar em nome de outra Identity nesta
 * fundação (mesmo padrão anti-IDOR de `PATCH /identities/me/locale`, IP-002).
 */
@Controller('privacy/requests')
export class PrivacyController {
  constructor(
    private readonly exportUseCase: RequestDataExportUseCase,
    private readonly deletionUseCase: RequestDataDeletionUseCase,
    private readonly getUseCase: GetPrivacyRequestsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createPrivacyRequestSchema)) body: CreatePrivacyRequestBody,
    @Req() request: RequestWithContext,
  ): Promise<PrivacyRequestResponse> {
    const meta = this.meta(request);
    if (body.type === PRIVACY_REQUEST_TYPE.DATA_EXPORT) {
      return this.exportUseCase.execute(identity.identityId, meta);
    }
    return this.deletionUseCase.execute(identity.identityId, meta);
  }

  @Get()
  async listMine(@CurrentIdentity() identity: AuthenticatedIdentity): Promise<PrivacyRequestResponse[]> {
    return this.getUseCase.listMine(identity.identityId);
  }

  @Get(':requestId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('requestId', new ZodValidationPipe(requestIdSchema)) requestId: string,
  ): Promise<PrivacyRequestResponse> {
    return this.getUseCase.get(identity.identityId, requestId);
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
