import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12; // DOC-002 (vence specs antigas que dizem 8)

/** Política de senha da plataforma (DOC-002) — reusada em cadastro, reset e change. */
export const passwordPolicySchema = z
  .string({ required_error: 'password is required' })
  .min(PASSWORD_MIN_LENGTH, `password must have at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128)
  .regex(/[A-Z]/, 'password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'password must contain at least one special character');
