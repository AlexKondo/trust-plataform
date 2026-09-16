import { z } from 'zod';
import { PRIVACY_REQUEST_TYPE } from '../../domain/entities/privacy-request';

export interface RequestMeta {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const PRIVACY_REQUEST_TYPE_VALUES = Object.values(PRIVACY_REQUEST_TYPE) as [string, ...string[]];

export const createPrivacyRequestSchema = z.object({
  type: z.enum(PRIVACY_REQUEST_TYPE_VALUES, {
    errorMap: () => ({ message: `type must be one of: ${PRIVACY_REQUEST_TYPE_VALUES.join(', ')}` }),
  }),
});
export type CreatePrivacyRequestBody = z.infer<typeof createPrivacyRequestSchema>;

export interface PrivacyRequestResponse {
  id: string;
  type: string;
  status: string;
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  resultSummary: Record<string, number> | null;
  /** Só presente na resposta síncrona de um DATA_EXPORT recém-criado; nunca persistido, nunca recuperável depois. */
  exportedData?: unknown;
}
