/**
 * IP-023 — External Integrations & Webhooks.
 *
 * Allowlist explícita de eventos de domínio elegíveis para entrega a
 * partners externos via webhook assinado. Nenhum evento é entregue fora
 * desta lista — DOC-005/IP-023 §"Out of scope" proíbe exportar todo o
 * catálogo (`docs/event-catalog.md`) livremente.
 *
 * Critério de inclusão: marco de ciclo de vida de pedido/serviço ou
 * desfecho de disputa que um parceiro integrado precisaria para
 * reconciliar seu próprio sistema (ex.: fechar um ticket, disparar um
 * fluxo operacional). Critério de exclusão (ver Completion Report §"event
 * allowlist" para a lista completa e a razão de cada exclusão):
 * - sinais internos de Trust Score/Level/Badge (não são fato de negócio
 *   do parceiro — são pontuação interna da plataforma, TP-001);
 * - qualquer evento de Payment/Funds/TrustCustody (dado de PSP/custódia,
 *   nunca exposto a terceiros fora do próprio fluxo de pagamento);
 * - eventos de Identity/sessão (PII de autenticação);
 * - conteúdo de mensagens/conversas (PII de conteúdo, sem necessidade
 *   legítima de parceiro externo).
 *
 * Cada entrada também define os campos do payload ORIGINAL que são
 * repassados ao parceiro — a inclusão de um eventType aqui NÃO implica
 * repassar o payload inteiro (ver `sanitizeWebhookPayload`).
 */
export const WEBHOOK_ALLOWED_EVENT_TYPES = [
  'MarketplaceOrder.Scheduled',
  'MarketplaceOrder.Started',
  'MarketplaceOrder.ExecutionCompleted',
  'MarketplaceOrder.CustomerConfirmed',
  'MarketplaceOrder.Completed',
  'MarketplaceOrder.Cancelled',
  'MarketplaceDispute.Resolved',
] as const;

export type WebhookAllowedEventType = (typeof WEBHOOK_ALLOWED_EVENT_TYPES)[number];

export function isAllowedWebhookEventType(eventType: string): eventType is WebhookAllowedEventType {
  return (WEBHOOK_ALLOWED_EVENT_TYPES as readonly string[]).includes(eventType);
}

/**
 * Campos do payload ORIGINAL do evento que são seguros/úteis para um
 * parceiro externo, por eventType. Qualquer campo fora desta lista (ex.:
 * `decidedBy`, IDs internos de auditoria) é descartado por construção —
 * "fail closed" no que sai da plataforma, não só no que entra (mesma
 * postura de IP-009 para webhooks INBOUND).
 */
const ALLOWED_PAYLOAD_FIELDS: Record<WebhookAllowedEventType, readonly string[]> = {
  'MarketplaceOrder.Scheduled': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'schedulingId',
    'scheduledStart',
    'scheduledEnd',
    'status',
  ],
  'MarketplaceOrder.Started': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'startedAt',
    'status',
  ],
  'MarketplaceOrder.ExecutionCompleted': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'completedAt',
    'billableMinutes',
    'status',
  ],
  'MarketplaceOrder.CustomerConfirmed': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'amount',
    'currency',
    'confirmedAt',
    'status',
  ],
  'MarketplaceOrder.Completed': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'amount',
    'currency',
    'completedAt',
    'status',
  ],
  'MarketplaceOrder.Cancelled': [
    'orderId',
    'listingId',
    'buyerId',
    'sellerId',
    'previousStatus',
    'reason',
    'cancelledAt',
    'status',
  ],
  'MarketplaceDispute.Resolved': [
    'disputeId',
    'orderId',
    'buyerId',
    'sellerId',
    'decisionType',
    'refundAmount',
    'decidedAt',
  ],
};

/**
 * Repassa apenas os campos aprovados do payload original. Campos ausentes
 * no evento fonte simplesmente não aparecem — nunca são inventados.
 */
export function sanitizeWebhookPayload(
  eventType: WebhookAllowedEventType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ALLOWED_PAYLOAD_FIELDS[eventType];
  const sanitized: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in payload) {
      sanitized[field] = payload[field];
    }
  }
  return sanitized;
}
