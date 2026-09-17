import { randomBytes } from 'node:crypto';

/**
 * Segredo de assinatura: 32 bytes de entropia criptográfica, hex (64 chars).
 * Nunca logado (ver `webhook-delivery.consumer` e o controller — nenhum
 * `logger.info`/`error` inclui `secretActive`/`secretPrevious`/o segredo
 * gerado aqui).
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}
