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
