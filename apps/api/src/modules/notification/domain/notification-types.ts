/**
 * IP-013 — vocabulário de canal/entrega/categoria da notificação.
 *
 * Nenhum destes três conceitos existia antes desta IP:
 * - `NotificationChannel`: por onde o aviso sai. Só `IN_APP` é produzido de
 *   verdade hoje (é o canal desde o NTF-001 original); `EMAIL`/`PUSH` são
 *   valores aceitos pela coluna/tipo para um adapter futuro usar — nenhum
 *   provedor de e-mail/push é chamado por este módulo (fora de escopo desta
 *   IP: "no business logic inside notification consumers", e nenhum port de
 *   e-mail/push genérico é inventado aqui — ver IP-013-COMPLETION-REPORT.md).
 * - `NotificationDeliveryStatus`: IN_APP não tem passo de "enviar" separado
 *   de "criar" — a linha nascer JÁ É a entrega, por isso toda notificação
 *   IN_APP nasce `DELIVERED`. `PENDING`/`FAILED` só fariam sentido para um
 *   canal assíncrono (EMAIL/PUSH) que ainda não existe.
 * - `NotificationCategory`: toda regra do catálogo hoje é TRANSACTIONAL —
 *   decorre de um fato do próprio Member/Partner (proposta, pedido, disputa,
 *   pagamento, segurança da própria conta). Não existe nenhum conteúdo
 *   promocional/opcional no MVP, então não há nada para o usuário optar por
 *   não receber (a IP explicitly proíbe "spam engine"). `OPTIONAL` existe só
 *   para o dia em que um tipo de aviso genuinamente opcional (ex.: digest
 *   semanal, dica de produto) precisar de um toggle de opt-out — sem essa
 *   categoria hoje ter nenhum membro, um opt-out seria UI sem função.
 */
export const NOTIFICATION_CHANNEL = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  PUSH: 'PUSH',
} as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const NOTIFICATION_DELIVERY_STATUS = {
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;
export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUS)[keyof typeof NOTIFICATION_DELIVERY_STATUS];

export const NOTIFICATION_CATEGORY = {
  TRANSACTIONAL: 'TRANSACTIONAL',
  OPTIONAL: 'OPTIONAL',
} as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];
