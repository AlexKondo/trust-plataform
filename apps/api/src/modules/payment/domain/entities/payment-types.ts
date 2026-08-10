/** Tipos canônicos do módulo Payments (PAY-001..010). */

/**
 * Ciclo de vida do pagamento. `FUNDS_IN_CUSTODY` é o estado que dá sentido à
 * plataforma: o dinheiro saiu do cliente mas ainda não é do prestador.
 */
export const PAYMENT_STATUS = {
  CREATED: 'CREATED',
  AUTHORIZED: 'AUTHORIZED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  FUNDS_IN_CUSTODY: 'FUNDS_IN_CUSTODY',
  FUNDS_RELEASED: 'FUNDS_RELEASED',
  SETTLED: 'SETTLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * Transições válidas. Falha de autorização volta para CREATED porque a spec
 * permite nova tentativa (PAY-002 BR-005) — o histórico de tentativas fica em
 * `payment_authorizations`, não no status.
 */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  CREATED: [
    PAYMENT_STATUS.AUTHORIZED,
    PAYMENT_STATUS.AUTHORIZATION_FAILED,
    PAYMENT_STATUS.CANCELLED,
  ],
  AUTHORIZATION_FAILED: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.CANCELLED],
  AUTHORIZED: [PAYMENT_STATUS.FUNDS_IN_CUSTODY, PAYMENT_STATUS.CANCELLED],
  FUNDS_IN_CUSTODY: [PAYMENT_STATUS.FUNDS_RELEASED, PAYMENT_STATUS.REFUNDED],
  FUNDS_RELEASED: [PAYMENT_STATUS.SETTLED, PAYMENT_STATUS.REFUNDED],
  SETTLED: [PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED],
  PARTIALLY_REFUNDED: [PAYMENT_STATUS.REFUNDED],
  REFUNDED: [],
  CANCELLED: [],
};

/** Estados em que o dinheiro do cliente já saiu e ainda não virou do prestador. */
export const CUSTODY_STATUSES: readonly PaymentStatus[] = [
  PAYMENT_STATUS.FUNDS_IN_CUSTODY,
  PAYMENT_STATUS.FUNDS_RELEASED,
];

export const AUTHORIZATION_STATUS = {
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  ERROR: 'ERROR',
} as const;

export type AuthorizationStatus =
  (typeof AUTHORIZATION_STATUS)[keyof typeof AUTHORIZATION_STATUS];
