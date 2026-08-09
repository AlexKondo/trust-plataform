/**
 * Ciclo de vida da conta (IDN-001 BR-004 / ID-002):
 * PENDING_EMAIL_VERIFICATION → ACTIVE (após IDN-002 Verify Email).
 * SUSPENDED reservado para ações administrativas (pós-MVP dos endpoints admin).
 */
export const IDENTITY_STATUS = {
  PENDING_EMAIL_VERIFICATION: 'PENDING_EMAIL_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type IdentityStatus = (typeof IDENTITY_STATUS)[keyof typeof IDENTITY_STATUS];
