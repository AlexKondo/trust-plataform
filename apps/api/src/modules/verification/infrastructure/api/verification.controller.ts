import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ValidationException } from '../../../../shared/api/validation.exception';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import {
  ApproveRequest,
  CreateVerificationRequest,
  RejectRequest,
  RequestMeta,
  StartReviewRequest,
  approveRequestSchema,
  createVerificationRequestSchema,
  rejectRequestSchema,
  startReviewRequestSchema,
} from '../../application/dto/verification.dtos';
import { CreateVerificationUseCase } from '../../application/usecases/create-verification.usecase';
import {
  ApproveVerificationUseCase,
  RejectVerificationUseCase,
} from '../../application/usecases/decide-verification.usecase';
import {
  GetVerificationUseCase,
  VerificationDetailsResponse,
} from '../../application/usecases/get-verification.usecase';
import { ReviewVerificationUseCase } from '../../application/usecases/review-verification.usecase';
import { SubmitEvidenceUseCase } from '../../application/usecases/submit-evidence.usecase';
import { EvidenceFileTooLargeException } from '../../domain/exceptions/verification.exceptions';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const verificationIdSchema = z.string().uuid('verificationId must be a valid UUID');

@Controller('verifications')
export class VerificationController {
  constructor(
    private readonly createUseCase: CreateVerificationUseCase,
    private readonly submitEvidenceUseCase: SubmitEvidenceUseCase,
    private readonly reviewUseCase: ReviewVerificationUseCase,
    private readonly approveUseCase: ApproveVerificationUseCase,
    private readonly rejectUseCase: RejectVerificationUseCase,
    private readonly getUseCase: GetVerificationUseCase,
  ) {}

  /** VRF-001 — inicia verificação para o próprio Passport. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createVerificationRequestSchema)) body: CreateVerificationRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.createUseCase.execute(identity.identityId, body.type, this.meta(request));
  }

  /** VRF-002 — envia evidência (multipart: campo `type` + arquivo `file`). */
  @Post(':verificationId/evidence')
  @HttpCode(HttpStatus.CREATED)
  async submitEvidence(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('verificationId', new ZodValidationPipe(verificationIdSchema)) verificationId: string,
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
    const evidenceTypeField = file.fields.type;
    const evidenceType =
      evidenceTypeField && 'value' in evidenceTypeField
        ? String((evidenceTypeField as { value: unknown }).value)
        : '';
    if (!evidenceType) {
      throw new ValidationException(
        new z.ZodError([
          { code: 'custom', path: ['type'], message: 'multipart field "type" is required' },
        ]),
      );
    }

    let content: Buffer;
    try {
      content = await file.toBuffer();
    } catch {
      throw new EvidenceFileTooLargeException(0);
    }

    return this.submitEvidenceUseCase.execute(
      identity.identityId,
      {
        verificationId,
        evidenceType,
        fileName: file.filename ?? 'evidence',
        mimeType: file.mimetype,
        content,
      },
      this.meta(request),
    );
  }

  /** VRF-003 — inicia revisão (ADMIN). */
  @Post(':verificationId/review')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async review(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('verificationId', new ZodValidationPipe(verificationIdSchema)) verificationId: string,
    @Body(new ZodValidationPipe(startReviewRequestSchema)) body: StartReviewRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.reviewUseCase.execute(
      identity.identityId,
      verificationId,
      body.reviewType,
      this.meta(request),
    );
  }

  /** VRF-004 — aprova (ADMIN). */
  @Post(':verificationId/approve')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('verificationId', new ZodValidationPipe(verificationIdSchema)) verificationId: string,
    @Body(new ZodValidationPipe(approveRequestSchema)) body: ApproveRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.approveUseCase.execute(
      identity.identityId,
      verificationId,
      body.comments,
      this.meta(request),
    );
  }

  /** VRF-005 — rejeita com motivo do catálogo (ADMIN). */
  @Post(':verificationId/reject')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('verificationId', new ZodValidationPipe(verificationIdSchema)) verificationId: string,
    @Body(new ZodValidationPipe(rejectRequestSchema)) body: RejectRequest,
    @Req() request: RequestWithContext,
  ) {
    return this.rejectUseCase.execute(identity.identityId, verificationId, body, this.meta(request));
  }

  /** VRF-006 — minhas verificações (a tela precisa saber o que já foi enviado). */
  @Get()
  async listMine(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.getUseCase.listMine(identity.identityId);
  }

  /** VRF-006 — consulta (dono ou admin). */
  @Get(':verificationId')
  async get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('verificationId', new ZodValidationPipe(verificationIdSchema)) verificationId: string,
    @Req() request: RequestWithContext,
  ): Promise<VerificationDetailsResponse> {
    return this.getUseCase.execute(identity.identityId, verificationId, this.meta(request));
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
