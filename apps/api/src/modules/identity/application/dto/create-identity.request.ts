import { z } from 'zod';
import { passwordPolicySchema } from './password-policy';

const FULL_NAME_MIN_LENGTH = 3; // INCONSISTENCIAS #2

/**
 * Validação sintática + política de senha (DOC-002) na borda.
 * Regras de negócio (e-mail duplicado etc.) ficam no domínio/use case.
 */
export const createIdentityRequestSchema = z
  .object({
    fullName: z
      .string({ required_error: 'fullName is required' })
      .trim()
      .min(FULL_NAME_MIN_LENGTH, `fullName must have at least ${FULL_NAME_MIN_LENGTH} characters`)
      .max(150, 'fullName must have at most 150 characters'),
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .toLowerCase()
      .email('email must be a valid email address')
      .max(255),
    password: passwordPolicySchema,
    confirmPassword: z.string({ required_error: 'confirmPassword is required' }),
    acceptTerms: z.boolean({ required_error: 'acceptTerms is required' }),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'confirmPassword must match password',
      });
    }
    if (data.acceptTerms !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acceptTerms'],
        message: 'terms of use must be accepted',
      });
    }
    // DOC-002: senha não pode conter nome ou e-mail do usuário
    const lowered = data.password.toLowerCase();
    const emailLocalPart = data.email?.split('@')[0] ?? '';
    if (emailLocalPart.length >= 3 && lowered.includes(emailLocalPart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'password must not contain your email',
      });
    }
    for (const namePart of (data.fullName ?? '').toLowerCase().split(/\s+/)) {
      if (namePart.length >= 3 && lowered.includes(namePart)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'password must not contain your name',
        });
        break;
      }
    }
  });

export type CreateIdentityRequest = z.infer<typeof createIdentityRequestSchema>;
