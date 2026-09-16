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
 *
 * IP-008 — completa as transições de reembolso que o PACK-01 deixou
 * deliberadamente incompletas ("liquidação e reembolso entram em Packs
 * futuros", comentário original de `trust-custody.ts`/PAY-006 nunca teve
 * `RefundPaymentUseCase` até esta IP). Duas lacunas ADITIVAS foram fechadas
 * (nenhuma aresta existente foi removida ou redefinida):
 * 1. `FUNDS_IN_CUSTODY`/`FUNDS_RELEASED` agora também aceitam
 *    `PARTIALLY_REFUNDED` diretamente — antes só `SETTLED` aceitava um
 *    reembolso PARCIAL; um reembolso parcial de dinheiro ainda em custódia
 *    (ex.: disputa parcialmente procedente decidida antes da liquidação) não
 *    tinha aresta nenhuma e derrubaria `Payment.registerRefund()` com
 *    `PaymentTransitionException` — bug real, encontrado escrevendo o teste
 *    de corrida desta IP (`refund-payment.usecase.spec.ts`), não hipotético.
 * 2. `PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED` (auto-laço): PAY-006 BR-005
 *    exige suportar MÚLTIPLOS reembolsos por Payment, desde que a soma não
 *    ultrapasse o valor pago — sem este auto-laço, um SEGUNDO reembolso
 *    parcial (que não esgota o saldo) tentaria "transicionar" de
 *    PARTIALLY_REFUNDED para PARTIALLY_REFUNDED e seria recusado como se
 *    fosse um salto de estado inválido, quando na verdade é o mesmo estado
 *    persistindo com um valor acumulado maior.
 */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  CREATED: [
    PAYMENT_STATUS.AUTHORIZED,
    PAYMENT_STATUS.AUTHORIZATION_FAILED,
    PAYMENT_STATUS.CANCELLED,
  ],
  AUTHORIZATION_FAILED: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.CANCELLED],
  AUTHORIZED: [PAYMENT_STATUS.FUNDS_IN_CUSTODY, PAYMENT_STATUS.CANCELLED],
  FUNDS_IN_CUSTODY: [
    PAYMENT_STATUS.FUNDS_RELEASED,
    PAYMENT_STATUS.REFUNDED,
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
  ],
  FUNDS_RELEASED: [
    PAYMENT_STATUS.SETTLED,
    PAYMENT_STATUS.REFUNDED,
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
  ],
  SETTLED: [PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED],
  PARTIALLY_REFUNDED: [PAYMENT_STATUS.PARTIALLY_REFUNDED, PAYMENT_STATUS.REFUNDED],
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
