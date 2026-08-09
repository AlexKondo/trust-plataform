import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Chaves ES256 em PEM, codificadas em base64 (uma linha no .env)
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY is required (base64 PEM)'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required (base64 PEM)'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).default(50),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),

  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return result.data;
}
