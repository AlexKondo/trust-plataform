/**
 * Catálogo de tipos e requisitos de evidência (VRF-001 BR-002, VRF-002 BR-002).
 * PHONE e EMAIL ficam para a fase de OTP (e-mail já é coberto pelo IDN-002).
 */
export const VERIFICATION_TYPES = [
  'DOCUMENT',
  'ADDRESS',
  'BANK_ACCOUNT',
  'BUSINESS',
  'BIOMETRIC',
] as const;

export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const EVIDENCE_REQUIREMENTS: Record<VerificationType, readonly string[]> = {
  DOCUMENT: ['DOCUMENT_FRONT', 'DOCUMENT_BACK'],
  ADDRESS: ['PROOF_OF_ADDRESS'],
  BANK_ACCOUNT: ['BANK_STATEMENT'],
  BUSINESS: ['BUSINESS_REGISTRATION'],
  BIOMETRIC: ['SELFIE'],
};

export const VERIFICATION_STATUS = {
  WAITING_FOR_EVIDENCE: 'WAITING_FOR_EVIDENCE',
  PENDING_REVIEW: 'PENDING_REVIEW',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type VerificationStatus =
  (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

/** Estados que contam como "verificação ativa" (VRF-001 BR-003). */
export const ACTIVE_STATUSES: readonly VerificationStatus[] = [
  VERIFICATION_STATUS.WAITING_FOR_EVIDENCE,
  VERIFICATION_STATUS.PENDING_REVIEW,
  VERIFICATION_STATUS.IN_REVIEW,
];

export const REVIEW_TYPES = ['AUTOMATIC', 'MANUAL', 'EXTERNAL_PROVIDER'] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

/** Catálogo de motivos de rejeição (VRF-005 BR-003). */
export const REJECTION_REASONS = [
  'DOCUMENT_UNREADABLE',
  'DOCUMENT_EXPIRED',
  'DOCUMENT_INCOMPLETE',
  'FACE_MISMATCH',
  'ADDRESS_INVALID',
  'PHONE_VERIFICATION_FAILED',
  'FRAUD_SUSPECTED',
  'INSUFFICIENT_EVIDENCE',
  'OTHER',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];
