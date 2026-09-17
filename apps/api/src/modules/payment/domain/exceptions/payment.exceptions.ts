import {
  BusinessRuleViolationException,
  DomainException,
  EntityNotFoundException,
  ForbiddenOperationException,
  StateConflictException,
} from '../../../../shared/domain/exceptions/domain.exception';

export class PaymentNotFoundException extends EntityNotFoundException {
  readonly code = 'PAYMENT_NOT_FOUND';

  constructor() {
    super('Payment not found.');
  }
}

/** PAY-001 BR-001: um Payment ativo por pedido → 409. */
export class PaymentAlreadyExistsException extends StateConflictException {
  readonly code = 'PAYMENT_ALREADY_EXISTS';

  constructor() {
    super('This order already has a payment.');
  }
}

/** Salto de estado no pagamento → 409. */
export class PaymentTransitionException extends StateConflictException {
  readonly code = 'PAYMENT_INVALID_TRANSITION';

  constructor(from: string, to: string) {
    super(`Payment cannot move from ${from} to ${to}.`);
  }
}

/** Só o comprador paga o próprio pedido → 403. */
export class PaymentAccessDeniedException extends ForbiddenOperationException {
  readonly code = 'PAYMENT_FORBIDDEN';

  constructor(message = 'Only the buyer and the seller can access this payment.') {
    super(message);
  }
}

/** Dados financeiros inválidos (valor, moeda) → 422. */
export class PaymentValidationException extends BusinessRuleViolationException {
  readonly code = 'PAYMENT_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/** Falha do provedor externo → 502: o erro não é do cliente nem nosso. */
export class PaymentGatewayException extends DomainException {
  readonly code = 'PAYMENT_GATEWAY_ERROR';
  override readonly httpStatus = 502;

  constructor(message: string) {
    super(message);
  }
}

/** Salto de estado na custódia → 409 (PACK-01 §7.2). */
export class TrustCustodyTransitionException extends StateConflictException {
  readonly code = 'TRUST_CUSTODY_INVALID_TRANSITION';

  constructor(from: string, to: string) {
    super(`Trust custody cannot move from ${from} to ${to}.`);
  }
}

/** Um Payment tem no máximo uma custódia (PACK-01 §6.2) → 409. */
export class TrustCustodyAlreadyExistsException extends StateConflictException {
  readonly code = 'TRUST_CUSTODY_ALREADY_EXISTS';

  constructor() {
    super('This payment already has a trust custody.');
  }
}

/**
 * Snapshot da custódia divergiu do Payment (PACK-01 §18). Não é erro do
 * usuário: é inconsistência financeira que exige investigação, e por isso a
 * liberação para em vez de "corrigir" o valor.
 */
export class TrustCustodyInconsistentException extends StateConflictException {
  readonly code = 'TRUST_CUSTODY_INCONSISTENT';

  constructor(message: string) {
    super(message);
  }
}

// ── Reembolso (IP-008 / PAY-006) ────────────────────────────────────────────

/** PAY-006 BR-001: o pagamento não está num estado elegível para reembolso → 409. */
export class RefundNotAllowedException extends StateConflictException {
  readonly code = 'REFUND_NOT_ALLOWED';

  constructor(status: string) {
    super(`A payment in ${status} is not eligible for refund.`);
  }
}

/**
 * PAY-006 BR-005: a soma dos reembolsos nunca ultrapassa o valor liquidado.
 * Esta é a mesma invariante financeira que a liberação nunca pode exceder a
 * custódia (IP-007) — aqui protegida por um UPDATE condicional no banco, não
 * só pela checagem em memória (ver `PaymentRepository.applyRefundIfExpected`).
 */
export class RefundLimitExceededException extends BusinessRuleViolationException {
  readonly code = 'REFUND_LIMIT_EXCEEDED';

  constructor(requestedCents: number, refundableCents: number) {
    super(
      `Refund of ${requestedCents} cents exceeds the refundable balance of ${refundableCents} cents.`,
    );
  }
}

/** O provedor recusou/errou o reembolso → não é erro do cliente nem nosso. */
export class RefundFailedException extends DomainException {
  readonly code = 'REFUND_FAILED';
  override readonly httpStatus = 502;

  constructor(message: string) {
    super(message);
  }
}

/** Dados do reembolso inválidos (valor zero/negativo, motivo ausente) → 422. */
export class RefundValidationException extends BusinessRuleViolationException {
  readonly code = 'REFUND_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/** Salto de estado no reembolso → 409. */
export class RefundTransitionException extends StateConflictException {
  readonly code = 'REFUND_INVALID_TRANSITION';

  constructor(from: string, to: string) {
    super(`Refund cannot move from ${from} to ${to}.`);
  }
}

/** IP-010 — postagem de ledger desbalanceada ou com valor inválido → 422. */
export class LedgerValidationException extends BusinessRuleViolationException {
  readonly code = 'LEDGER_INVALID';

  constructor(message: string) {
    super(message);
  }
}

/** IP-010 — ledger diverge do estado de domínio para um Payment → 409 (nunca corrigido silenciosamente). */
export class LedgerReconciliationException extends StateConflictException {
  readonly code = 'LEDGER_RECONCILIATION_MISMATCH';

  constructor(message: string) {
    super(message);
  }
}
