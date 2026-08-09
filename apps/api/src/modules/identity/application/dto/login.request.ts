import { z } from 'zod';

/** BR-002: e-mail e senha obrigatórios. Sem política de força aqui — login valida contra o hash. */
export const loginRequestSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .toLowerCase()
    .email('email must be a valid email address'),
  password: z.string({ required_error: 'password is required' }).min(1, 'password is required'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
