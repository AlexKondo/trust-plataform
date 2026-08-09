import { z } from 'zod';

export const refreshSessionRequestSchema = z.object({
  refreshToken: z
    .string({ required_error: 'refreshToken is required' })
    .min(20, 'refreshToken is malformed')
    .max(255),
});

export type RefreshSessionRequest = z.infer<typeof refreshSessionRequestSchema>;
