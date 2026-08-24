import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  EvidenceFileTooLargeException,
  EvidenceTypeNotRequiredException,
  UnsupportedMediaTypeException,
  VerificationAccessDeniedException,
  VerificationNotFoundException,
} from '../../domain/exceptions/verification.exceptions';
import { VerificationRepository } from '../../domain/repositories/verification.repository';
import { EvidenceStorageService } from '../../domain/services/evidence-storage.service';
import { ALLOWED_EVIDENCE_MIME_TYPES, RequestMeta } from '../dto/verification.dtos';

const VRF_PRODUCER = 'verification-service';

export interface SubmitEvidenceInput {
  verificationId: string;
  evidenceType: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

/** VRF-002 — recebe evidência, valida, armazena e avança o status quando completo. */
@Injectable()
export class SubmitEvidenceUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly storage: EvidenceStorageService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SubmitEvidenceUseCase.name);
  }

  async execute(
    identityId: string,
    input: SubmitEvidenceInput,
    meta: RequestMeta = {},
  ): Promise<{ verificationId: string; status: string }> {
    const verification = await this.repository.findById(input.verificationId);
    if (!verification) {
      throw new VerificationNotFoundException();
    }
    if (verification.identityId !== identityId) {
      throw new VerificationAccessDeniedException();
    }
    verification.assertAcceptsEvidence();

    if (!verification.requiredEvidenceTypes.includes(input.evidenceType)) {
      throw new EvidenceTypeNotRequiredException(input.evidenceType, verification.type);
    }
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(input.mimeType as never)) {
      throw new UnsupportedMediaTypeException(input.mimeType);
    }
    if (input.content.length > this.config.evidenceMaxFileBytes) {
      throw new EvidenceFileTooLargeException(this.config.evidenceMaxFileBytes);
    }

    const evidenceId = uuidv7();
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
    const storageKey = `verifications/${verification.id}/${evidenceId}-${safeName}`;
    const checksum = createHash('sha256').update(input.content).digest('hex');

    // Upload antes da transação: se falhar, nada é persistido
    await this.storage.upload({
      storageKey,
      content: input.content,
      mimeType: input.mimeType,
    });

    const uploadedAt = new Date();
    const submittedTypes = (await this.repository.listEvidences(verification.id)).map(
      (evidence) => evidence.type,
    );
    submittedTypes.push(input.evidenceType);
    const complete = verification.evidenceSubmitted(submittedTypes, uploadedAt);

    await this.db.transaction(async (tx) => {
      await this.repository.addEvidence(
        {
          id: evidenceId,
          verificationId: verification.id,
          type: input.evidenceType,
          storageKey,
          fileName: safeName,
          mimeType: input.mimeType,
          fileSize: input.content.length,
          checksum,
          uploadedAt,
        },
        tx,
      );
      await this.repository.save(verification, tx);
      if (complete) {
        await this.outboxService.enqueue(tx, {
          eventType: 'Verification.EvidenceSubmitted',
          aggregateType: 'Verification',
          aggregateId: verification.id,
          producer: VRF_PRODUCER,
          correlationId: meta.correlationId ?? verification.id,
          payload: {
            verificationId: verification.id,
            trustPassportId: verification.trustPassportId,
            type: verification.type,
            submittedAt: uploadedAt.toISOString(),
          },
        });
      }
      await this.auditLogService.record(
        {
          identityId,
          operation: 'SubmitVerificationEvidence',
          resource: 'Verification',
          resourceId: verification.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          // Nunca o conteúdo — apenas metadados (VRF-002/trust-logging)
          metadata: { evidenceType: input.evidenceType, fileSize: input.content.length },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'SubmitVerificationEvidence',
        identityId,
        verificationId: verification.id,
        evidenceType: input.evidenceType,
        status: verification.status,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Evidence submitted.',
    );

    return { verificationId: verification.id, status: verification.status };
  }
}
