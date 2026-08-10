import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import {
  VerificationAccessDeniedException,
  VerificationNotFoundException,
} from '../../domain/exceptions/verification.exceptions';
import { VerificationRepository } from '../../domain/repositories/verification.repository';
import { RequestMeta } from '../dto/verification.dtos';

export interface VerificationDetailsResponse {
  verificationId: string;
  type: string;
  status: string;
  currentAttempt: number;
  createdAt: string;
  updatedAt: string;
  review: {
    status: string;
    reviewType: string;
    startedAt: string;
    completedAt: string | null;
  } | null;
  decision: {
    decision: string;
    decisionSource: string;
    reasonCode: string | null;
    comments: string | null;
    decidedAt: string;
  } | null;
  evidences: Array<{
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

/** Item da fila de análise (ADMIN) — resumo + identificação do titular. */
export interface VerificationQueueItem {
  verificationId: string;
  identityId: string;
  identityName: string;
  identityEmail: string;
  type: string;
  status: string;
  currentAttempt: number;
  createdAt: string;
  evidences: Array<{
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

/** VRF-006 — consulta (dono ou admin; nunca retorna conteúdo de arquivos, BR-004). */
@Injectable()
export class GetVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly identityRepository: IdentityRepository,
    private readonly trustPassportRepository: TrustPassportRepository,
    private readonly auditLogService: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GetVerificationUseCase.name);
  }

  /**
   * VRF-006 (listagem) — todas as verificações do próprio Passport, com as
   * evidências já enviadas: é o que a tela precisa para saber o que falta.
   */
  async listMine(identityId: string): Promise<VerificationDetailsResponse[]> {
    const passport = await this.trustPassportRepository.findByIdentityId(identityId);
    if (!passport) {
      return [];
    }
    const verifications = await this.repository.listByPassportId(passport.id);
    return Promise.all(
      verifications.map(async (verification) => {
        const [review, decision, evidences] = await Promise.all([
          this.repository.findLatestReview(verification.id),
          this.repository.findDecision(verification.id),
          this.repository.listEvidences(verification.id),
        ]);
        return {
          verificationId: verification.id,
          type: verification.type,
          status: verification.status,
          currentAttempt: verification.currentAttempt,
          createdAt: verification.createdAt.toISOString(),
          updatedAt: verification.updatedAt.toISOString(),
          review: review
            ? {
                status: review.status,
                reviewType: review.reviewType,
                startedAt: review.startedAt.toISOString(),
                completedAt: review.completedAt?.toISOString() ?? null,
              }
            : null,
          decision: decision
            ? {
                decision: decision.decision,
                decisionSource: decision.decisionSource,
                reasonCode: decision.reasonCode,
                comments: decision.comments,
                decidedAt: decision.decidedAt.toISOString(),
              }
            : null,
          evidences: evidences.map((evidence) => ({
            id: evidence.id,
            type: evidence.type,
            fileName: evidence.fileName,
            mimeType: evidence.mimeType,
            fileSize: evidence.fileSize,
            uploadedAt: evidence.uploadedAt.toISOString(),
          })),
        };
      }),
    );
  }

  /**
   * VRF-003 (fila) — verificações aguardando análise, para o painel admin.
   * Inclui o nome do titular: quem revisa precisa saber de quem é o documento.
   */
  async listQueue(
    statuses: readonly string[],
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<VerificationQueueItem>> {
    const { items, totalItems } = await this.repository.listByStatuses(statuses, page, pageSize);
    const enriched = await Promise.all(
      items.map(async (verification) => {
        const [identity, evidences] = await Promise.all([
          this.identityRepository.findById(verification.identityId),
          this.repository.listEvidences(verification.id),
        ]);
        return {
          verificationId: verification.id,
          identityId: verification.identityId,
          identityName: identity?.fullName ?? '—',
          identityEmail: identity?.email ?? '—',
          type: verification.type,
          status: verification.status,
          currentAttempt: verification.currentAttempt,
          createdAt: verification.createdAt.toISOString(),
          evidences: evidences.map((evidence) => ({
            id: evidence.id,
            type: evidence.type,
            fileName: evidence.fileName,
            mimeType: evidence.mimeType,
            fileSize: evidence.fileSize,
            uploadedAt: evidence.uploadedAt.toISOString(),
          })),
        };
      }),
    );
    return PaginatedResult.of(enriched, page, pageSize, totalItems);
  }

  async execute(
    requesterIdentityId: string,
    verificationId: string,
    meta: RequestMeta = {},
  ): Promise<VerificationDetailsResponse> {
    const verification = await this.repository.findById(verificationId);
    if (!verification) {
      throw new VerificationNotFoundException();
    }

    if (verification.identityId !== requesterIdentityId) {
      const requester = await this.identityRepository.findById(requesterIdentityId);
      if (!requester?.isAdmin) {
        throw new VerificationAccessDeniedException();
      }
    }

    const [review, decision, evidences] = await Promise.all([
      this.repository.findLatestReview(verification.id),
      this.repository.findDecision(verification.id),
      this.repository.listEvidences(verification.id),
    ]);

    // BR-006: consulta auditada (inclui acessos administrativos a dados de terceiros)
    await this.auditLogService.recordSafe({
      identityId: requesterIdentityId,
      operation: 'GetVerification',
      resource: 'Verification',
      resourceId: verification.id,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      metadata: { owner: verification.identityId === requesterIdentityId },
    });

    return {
      verificationId: verification.id,
      type: verification.type,
      status: verification.status,
      currentAttempt: verification.currentAttempt,
      createdAt: verification.createdAt.toISOString(),
      updatedAt: verification.updatedAt.toISOString(),
      review: review
        ? {
            status: review.status,
            reviewType: review.reviewType,
            startedAt: review.startedAt.toISOString(),
            completedAt: review.completedAt?.toISOString() ?? null,
          }
        : null,
      decision: decision
        ? {
            decision: decision.decision,
            decisionSource: decision.decisionSource,
            reasonCode: decision.reasonCode,
            comments: decision.comments,
            decidedAt: decision.decidedAt.toISOString(),
          }
        : null,
      evidences: evidences.map((evidence) => ({
        id: evidence.id,
        type: evidence.type,
        fileName: evidence.fileName,
        mimeType: evidence.mimeType,
        fileSize: evidence.fileSize,
        uploadedAt: evidence.uploadedAt.toISOString(),
      })),
    };
  }
}
