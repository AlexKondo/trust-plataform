import { z } from 'zod';
import { passwordPolicySchema } from './password-policy';

export const forgotPasswordRequestSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .toLowerCase()
    .email('email must be a valid email address'),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z
    .string({ required_error: 'token is required' })
    .min(20, 'token is malformed')
    .max(255),
  newPassword: passwordPolicySchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z
    .string({ required_error: 'currentPassword is required' })
    .min(1, 'currentPassword is required'),
  newPassword: passwordPolicySchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
