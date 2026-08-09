import { z } from 'zod';
import { REJECTION_REASONS, REVIEW_TYPES, VERIFICATION_TYPES } from '../../domain/entities/verification-types';

export interface RequestMeta {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const createVerificationRequestSchema = z.object({
  type: z.enum(VERIFICATION_TYPES, {
    errorMap: () => ({ message: `type must be one of: ${VERIFICATION_TYPES.join(', ')}` }),
  }),
});
export type CreateVerificationRequest = z.infer<typeof createVerificationRequestSchema>;

export const startReviewRequestSchema = z.object({
  reviewType: z.enum(REVIEW_TYPES).default('MANUAL'),
});
export type StartReviewRequest = z.infer<typeof startReviewRequestSchema>;

export const approveRequestSchema = z.object({
  comments: z.string().trim().max(1000).optional(),
});
export type ApproveRequest = z.infer<typeof approveRequestSchema>;

export const rejectRequestSchema = z.object({
  reasonCode: z.enum(REJECTION_REASONS, {
    errorMap: () => ({ message: `reasonCode must be one of: ${REJECTION_REASONS.join(', ')}` }),
  }),
  comments: z.string().trim().max(1000).optional(),
});
export type RejectRequest = z.infer<typeof rejectRequestSchema>;

/** MIME types aceitos para evidências (VRF-002 BR-003). */
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
