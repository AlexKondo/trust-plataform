import { IncrementalTrustCustody } from '../entities/incremental-trust-custody';
import { Payment } from '../entities/payment';
import { PAYMENT_STATUS } from '../entities/payment-types';
import { CUSTODY_STATUS, TrustCustody } from '../entities/trust-custody';

/**
 * Motivos de negação legíveis por máquina (PACK-01 §10). São estáveis: entram
 * em auditoria e log, então mudá-los quebra investigação de histórico.
 */
export const RELEASE_DENIAL_REASON = {
  CUSTODY_NOT_IN_CUSTODY: 'CUSTODY_NOT_IN_CUSTODY',
  PAYMENT_NOT_IN_CUSTODY: 'PAYMENT_NOT_IN_CUSTODY',
  ORDER_MISMATCH: 'ORDER_MISMATCH',
  MISSING_CUSTOMER_CONFIRMATION: 'MISSING_CUSTOMER_CONFIRMATION',
  DISPUTE_OPEN: 'DISPUTE_OPEN',
  SNAPSHOT_MISMATCH: 'SNAPSHOT_MISMATCH',
} as const;

export type ReleaseDenialReason =
  (typeof RELEASE_DENIAL_REASON)[keyof typeof RELEASE_DENIAL_REASON];

export interface ReleaseEvaluationInput {
  custody: TrustCustody;
  payment: Payment;
  /** `orderId` que veio no evento de confirmação do cliente. */
  confirmedOrderId: string;
  /** O evento representa aceite do cliente para o serviço concluído? */
  customerConfirmed: boolean;
  /** Existe disputa ativa (OPEN/IN_ANALYSIS/MEDIATION) para o pedido? */
  hasActiveDispute: boolean;
}

export interface ReleaseDecision {
  allowed: boolean;
  reasons: ReleaseDenialReason[];
}

/**
 * Política mínima e **determinística** de liberação (PACK-01 §10).
 *
 * É função pura de propósito: a decisão de soltar dinheiro precisa ser
 * reproduzível a partir do estado, sem depender de relógio, de I/O ou de ordem
 * de chegada de evento. O que ela NÃO faz, por decisão explícita do Pack:
 * liberação por tempo, janela de retenção por categoria e atraso configurável.
 *
 * Retorna TODOS os motivos, não só o primeiro — quem investiga uma liberação
 * negada quer o quadro inteiro de uma vez.
 */
export function evaluateRelease(input: ReleaseEvaluationInput): ReleaseDecision {
  const { custody, payment, confirmedOrderId, customerConfirmed, hasActiveDispute } = input;
  const reasons: ReleaseDenialReason[] = [];

  if (custody.status !== CUSTODY_STATUS.IN_CUSTODY) {
    reasons.push(RELEASE_DENIAL_REASON.CUSTODY_NOT_IN_CUSTODY);
  }
  if (payment.status !== PAYMENT_STATUS.FUNDS_IN_CUSTODY) {
    reasons.push(RELEASE_DENIAL_REASON.PAYMENT_NOT_IN_CUSTODY);
  }
  if (confirmedOrderId !== custody.orderId) {
    reasons.push(RELEASE_DENIAL_REASON.ORDER_MISMATCH);
  }
  if (!customerConfirmed) {
    reasons.push(RELEASE_DENIAL_REASON.MISSING_CUSTOMER_CONFIRMATION);
  }
  if (hasActiveDispute) {
    reasons.push(RELEASE_DENIAL_REASON.DISPUTE_OPEN);
  }
  if (!snapshotMatches(custody, payment)) {
    reasons.push(RELEASE_DENIAL_REASON.SNAPSHOT_MISMATCH);
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * O snapshot da custódia foi copiado do Payment na criação. Divergir depois
 * significa que alguém alterou um dos dois fora do fluxo — a liberação para.
 */
function snapshotMatches(custody: TrustCustody, payment: Payment): boolean {
  return (
    custody.paymentId === payment.id &&
    custody.orderId === payment.orderId &&
    custody.buyerId === payment.buyerId &&
    custody.sellerId === payment.sellerId &&
    custody.amountCents === payment.amountCents &&
    custody.currency === payment.currency
  );
}

export interface IncrementalReleaseEvaluationInput {
  tranche: IncrementalTrustCustody;
  payment: Payment;
  confirmedOrderId: string;
  customerConfirmed: boolean;
  hasActiveDispute: boolean;
}

/**
 * IP-007 — mesma política de `evaluateRelease`, adaptada para uma TRANCHE
 * incremental em vez da custódia original.
 *
 * É uma função NOVA, não uma generalização de `evaluateRelease`, por um motivo
 * preciso: `evaluateRelease`/`snapshotMatches` exigem
 * `custody.amountCents === payment.amountCents` — verdade para a custódia
 * original (ela É o valor do Payment), mas FALSO por desenho para uma tranche
 * incremental (ela é só o delta de um Change Order, sempre menor que o
 * Payment inteiro). Reaproveitar `evaluateRelease` inalterado faria toda
 * tranche incremental falhar com `SNAPSHOT_MISMATCH` sempre — por isso esta
 * função troca a checagem de IGUALDADE de valor por uma checagem de
 * PERTENCIMENTO (a tranche referencia o mesmo Payment/pedido/partes), sem
 * tocar em `evaluateRelease` nem em `snapshotMatches` (zero risco de
 * regressão no caminho já fechado do PACK-01).
 */
export function evaluateIncrementalRelease(input: IncrementalReleaseEvaluationInput): ReleaseDecision {
  const { tranche, payment, confirmedOrderId, customerConfirmed, hasActiveDispute } = input;
  const reasons: ReleaseDenialReason[] = [];

  if (tranche.status !== CUSTODY_STATUS.IN_CUSTODY) {
    reasons.push(RELEASE_DENIAL_REASON.CUSTODY_NOT_IN_CUSTODY);
  }
  if (payment.status !== PAYMENT_STATUS.FUNDS_IN_CUSTODY && payment.status !== PAYMENT_STATUS.FUNDS_RELEASED) {
    // A tranche incremental não pilota o status do Payment (§release-funds):
    // quando a custódia original já liberou primeiro na mesma rodada de
    // confirmação, o Payment já está em FUNDS_RELEASED e isso não é motivo
    // para negar a tranche incremental — os dois fatos são independentes.
    reasons.push(RELEASE_DENIAL_REASON.PAYMENT_NOT_IN_CUSTODY);
  }
  if (confirmedOrderId !== tranche.orderId) {
    reasons.push(RELEASE_DENIAL_REASON.ORDER_MISMATCH);
  }
  if (!customerConfirmed) {
    reasons.push(RELEASE_DENIAL_REASON.MISSING_CUSTOMER_CONFIRMATION);
  }
  if (hasActiveDispute) {
    reasons.push(RELEASE_DENIAL_REASON.DISPUTE_OPEN);
  }
  if (!trancheBelongsToPayment(tranche, payment)) {
    reasons.push(RELEASE_DENIAL_REASON.SNAPSHOT_MISMATCH);
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * Pertencimento (não igualdade de valor, ver comentário acima): a tranche tem
 * que apontar para o MESMO Payment/comprador/vendedor/moeda e carregar um
 * valor positivo. Ao contrário da custódia original, o delta de um Change
 * Order pode legitimamente ser maior ou menor que o valor inicial do
 * contrato (§7 do PACK-03 não impõe teto de valor a um Change Order) — por
 * isso não há checagem de "menor ou igual ao Payment" aqui.
 */
function trancheBelongsToPayment(tranche: IncrementalTrustCustody, payment: Payment): boolean {
  return (
    tranche.paymentId === payment.id &&
    tranche.buyerId === payment.buyerId &&
    tranche.sellerId === payment.sellerId &&
    tranche.currency === payment.currency &&
    tranche.amountCents > 0
  );
}
