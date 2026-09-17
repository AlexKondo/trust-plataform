/**
 * IP-023 — limites de entrega. Constantes de código (não `.env`) porque não
 * dependem de segredo/ambiente — mesmo padrão de `EVENT_TYPE_PATTERN` em
 * `event-envelope.ts`.
 */
export const WEBHOOK_MAX_DELIVERY_ATTEMPTS = 8;
export const WEBHOOK_HTTP_TIMEOUT_MS = 10_000;
export const WEBHOOK_PAYLOAD_VERSION = '1';
