import { DomainException } from '../domain/exceptions/domain.exception';

/**
 * IP-014 — limite de tentativas por Identity+operação excedido (§6: "rate
 * limits canonical"). Mesma família HTTP do lockout de login
 * (AccountLockedException) → 429, mesma semântica: tente novamente mais
 * tarde, nunca revela contadores internos.
 */
export class SensitiveActionRateLimitExceededException extends DomainException {
  readonly code = 'SENSITIVE_ACTION_RATE_LIMIT_EXCEEDED';
  override readonly httpStatus = 429;

  constructor() {
    super('Too many attempts for this operation. Try again later.');
  }
}

export class RiskFlagNotFoundException extends DomainException {
  readonly code = 'RISK_FLAG_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Risk flag not found.');
  }
}

/** Revisar duas vezes o mesmo flag não é um erro de negócio interessante, mas
 * decidir sobre um flag já fechado precisa ser rejeitado explicitamente —
 * evita que dois admins "resolvam" o mesmo item com decisões divergentes. */
export class RiskFlagAlreadyReviewedException extends DomainException {
  readonly code = 'RISK_FLAG_ALREADY_REVIEWED';
  override readonly httpStatus = 409;

  constructor() {
    super('This risk flag has already been reviewed.');
  }
}
