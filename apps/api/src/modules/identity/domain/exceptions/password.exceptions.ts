import {
  BusinessRuleViolationException,
  DomainException,
} from '../../../../shared/domain/exceptions/domain.exception';

/** IDN-008: token de reset desconhecido/já usado/invalidado → 401 (mensagem opaca). */
export class InvalidResetTokenException extends DomainException {
  readonly code = 'INVALID_RESET_TOKEN';
  override readonly httpStatus = 401;

  constructor() {
    super('Invalid password reset token.');
  }
}

export class ExpiredResetTokenException extends DomainException {
  readonly code = 'EXPIRED_RESET_TOKEN';
  override readonly httpStatus = 401;

  constructor() {
    super('Password reset token has expired.');
  }
}

/** IDN-009 BR-003: senha atual não confere → 401 (sem detalhar). */
export class CurrentPasswordInvalidException extends DomainException {
  readonly code = 'CURRENT_PASSWORD_INVALID';
  override readonly httpStatus = 401;

  constructor() {
    super('Current password is invalid.');
  }
}

/** IDN-009 BR-005: nova senha igual à atual → 422. */
export class SamePasswordException extends BusinessRuleViolationException {
  readonly code = 'SAME_PASSWORD';

  constructor() {
    super('New password must be different from the current password.');
  }
}
