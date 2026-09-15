/**
 * Roda ANTES dos imports de cada arquivo de teste (vitest setupFiles).
 * Necessário porque ConfigModule.forRoot() executa no momento do import do
 * AppModule (decorator) — qualquer env definida em beforeAll chega tarde.
 * O bloco de conexão real só é montado quando TEST_DATABASE_URL está
 * definida (suítes e2e); os specs de unidade não usam nada disto.
 */
import { generateKeyPairSync } from 'node:crypto';

if (process.env.TEST_DATABASE_URL) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_PRIVATE_KEY = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
  ).toString('base64');
  process.env.JWT_PUBLIC_KEY = Buffer.from(
    publicKey.export({ type: 'spki', format: 'pem' }),
  ).toString('base64');
  process.env.OUTBOX_POLL_INTERVAL_MS = '60000';
  // Nunca enviar e-mail real em teste ('' tem precedência sobre o .env)
  process.env.BREVO_API_KEY = '';
  process.env.LOGIN_MAX_FAILED_ATTEMPTS = '3';
  process.env.LOGIN_LOCKOUT_MINUTES = '15';
  // Testes nunca chamam a API do HIBP
  process.env.PASSWORD_BREACH_CHECK_ENABLED = 'false';
  // Pooler do Supabase free limita 15 clients — cada suíte e2e usa pool pequeno
  process.env.DB_POOL_MAX = '4';
  // Storage de evidências em memória nos testes ('' = ausente no env schema)
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  // Loops de polling dos e2e não devem esbarrar no rate limit
  process.env.RATE_LIMIT_MAX_PER_MINUTE = '100000';
} else {
  // IP-001 — DX/CI-hygiene: sem TEST_DATABASE_URL (ex.: `pnpm test` puro,
  // sem Postgres disponível), os specs e2e/integration ficam corretamente
  // pulados via `describe.runIf(Boolean(testDatabaseUrl))` — mas
  // `ConfigModule.forRoot({ validate: validateEnv })` roda no MOMENTO do
  // import de app.module.ts (decorator), antes de qualquer `describe` ser
  // avaliado, e `DATABASE_URL`/`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` não têm
  // default no schema. Sem isto, o import already lança
  // "Invalid environment configuration" como rejeição não tratada durante a
  // coleta do Vitest, mesmo que nenhum teste do arquivo chegue a rodar.
  //
  // Estes valores nunca chegam a abrir conexão nenhuma: nenhum spec com
  // `describe.runIf(false)` instancia a aplicação (o `beforeAll` que faria
  // isso também é pulado), então isto só existe para satisfazer a validação
  // eager do schema, não para uso real.
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.JWT_PRIVATE_KEY ??= Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
  ).toString('base64');
  process.env.JWT_PUBLIC_KEY ??= Buffer.from(
    publicKey.export({ type: 'spki', format: 'pem' }),
  ).toString('base64');
}
