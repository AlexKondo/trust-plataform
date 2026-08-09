import { v7 as uuidv7 } from 'uuid';
import { InvalidVerificationStatusException } from '../exceptions/verification.exceptions';
import {
  EVIDENCE_REQUIREMENTS,
  VERIFICATION_STATUS,
  VerificationStatus,
  VerificationType,
} from './verification-types';

interface VerificationProps {
  id: string;
  trustPassportId: string;
  identityId: string;
  type: VerificationType;
  status: VerificationStatus;
  providerId: string | null;
  currentAttempt: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Aggregate root da Verification (VRF-001..005).
 * Máquina de estados canônica (PLANO §Módulo 3):
 * WAITING_FOR_EVIDENCE → PENDING_REVIEW → IN_REVIEW → APPROVED | REJECTED
 * (+ EXPIRED, CANCELLED terminais). Decisões são irreversíveis (BR-006/007).
 */
export class Verification {
  private constructor(private readonly props: VerificationProps) {}

  static createNew(input: {
    trustPassportId: string;
    identityId: string;
    type: VerificationType;
    attempt: number;
  }): Verification {
    const now = new Date();
    return new Verification({
      id: uuidv7(),
      trustPassportId: input.trustPassportId,
      identityId: input.identityId,
      type: input.type,
      status: VERIFICATION_STATUS.WAITING_FOR_EVIDENCE,
      providerId: null,
      currentAttempt: input.attempt,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  static restore(props: VerificationProps): Verification {
    return new Verification(props);
  }

  get id(): string {
    return this.props.id;
  }

  get trustPassportId(): string {
    return this.props.trustPassportId;
  }

  get identityId(): string {
    return this.props.identityId;
  }

  get type(): VerificationType {
    return this.props.type;
  }

  get status(): VerificationStatus {
    return this.props.status;
  }

  get providerId(): string | null {
    return this.props.providerId;
  }

  get currentAttempt(): number {
    return this.props.currentAttempt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  /** Requisitos de evidência do tipo desta verificação. */
  get requiredEvidenceTypes(): readonly string[] {
    return EVIDENCE_REQUIREMENTS[this.props.type];
  }

  /** VRF-002 BR-001: só recebe evidências aguardando evidência. */
  assertAcceptsEvidence(): void {
    this.assertStatus(VERIFICATION_STATUS.WAITING_FOR_EVIDENCE);
  }

  /** VRF-002 BR-005/006: com todas as evidências obrigatórias → PENDING_REVIEW. */
  evidenceSubmitted(submittedTypes: string[], now = new Date()): boolean {
    this.assertAcceptsEvidence();
    const complete = this.requiredEvidenceTypes.every((required) =>
      submittedTypes.includes(required),
    );
    if (complete) {
      this.props.status = VERIFICATION_STATUS.PENDING_REVIEW;
      this.props.updatedAt = now;
    }
    return complete;
  }

  /** VRF-003 BR-001/003. */
  startReview(now = new Date()): void {
    this.assertStatus(VERIFICATION_STATUS.PENDING_REVIEW);
    this.props.status = VERIFICATION_STATUS.IN_REVIEW;
    this.props.updatedAt = now;
  }

  /** VRF-004 BR-001/004. */
  approve(now = new Date()): void {
    this.assertStatus(VERIFICATION_STATUS.IN_REVIEW);
    this.props.status = VERIFICATION_STATUS.APPROVED;
    this.props.updatedAt = now;
  }

  /** VRF-005 BR-001/005. */
  reject(now = new Date()): void {
    this.assertStatus(VERIFICATION_STATUS.IN_REVIEW);
    this.props.status = VERIFICATION_STATUS.REJECTED;
    this.props.updatedAt = now;
  }

  private assertStatus(expected: VerificationStatus): void {
    if (this.props.status !== expected) {
      throw new InvalidVerificationStatusException(this.props.status, expected);
    }
  }
}
