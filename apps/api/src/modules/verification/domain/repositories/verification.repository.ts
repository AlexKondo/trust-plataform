import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Verification } from '../entities/verification';
import { VerificationType } from '../entities/verification-types';

export interface EvidenceRecord {
  id: string;
  verificationId: string;
  type: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  uploadedAt: Date;
}

export interface ReviewRecord {
  id: string;
  verificationId: string;
  reviewType: string;
  status: 'ACTIVE' | 'COMPLETED';
  reviewerIdentityId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface DecisionRecord {
  id: string;
  verificationId: string;
  reviewId: string;
  decision: 'APPROVED' | 'REJECTED';
  decisionSource: string;
  reasonCode: string | null;
  comments: string | null;
  decidedBy: string | null;
  decidedAt: Date;
}

export abstract class VerificationRepository {
  abstract save(verification: Verification, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<Verification | null>;
  abstract hasActiveByPassportAndType(
    trustPassportId: string,
    type: VerificationType,
  ): Promise<boolean>;
  abstract countByPassportAndType(
    trustPassportId: string,
    type: VerificationType,
  ): Promise<number>;

  abstract addEvidence(evidence: EvidenceRecord, executor?: DatabaseExecutor): Promise<void>;
  abstract listEvidences(verificationId: string): Promise<EvidenceRecord[]>;

  abstract addReview(review: ReviewRecord, executor?: DatabaseExecutor): Promise<void>;
  abstract findActiveReview(verificationId: string): Promise<ReviewRecord | null>;
  abstract findLatestReview(verificationId: string): Promise<ReviewRecord | null>;
  abstract completeReview(
    reviewId: string,
    completedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<void>;

  abstract addDecision(decision: DecisionRecord, executor?: DatabaseExecutor): Promise<void>;
  abstract findDecision(verificationId: string): Promise<DecisionRecord | null>;
}
