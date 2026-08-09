/**
 * Roda ANTES dos imports de cada arquivo de teste (vitest setupFiles).
 * Necessário porque ConfigModule.forRoot() executa no momento do import do
 * AppModule (decorator) — qualquer env definida em beforeAll chega tarde.
 * Só age quando TEST_DATABASE_URL está definida (suítes e2e).
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
}
