import {
  DomainException,
  ForbiddenOperationException,
} from '../../../../shared/domain/exceptions/domain.exception';

/**
 * BR-004: mensagem opaca — nunca revelar se o erro foi e-mail ou senha,
 * nem se a conta existe. → 401.
 */
export class InvalidCredentialsException extends DomainException {
  readonly code = 'INVALID_CREDENTIALS';
  override readonly httpStatus = 401;

  constructor() {
    super('Invalid credentials.');
  }
}

/** BR-001: só Identity ACTIVE loga (senha correta, mas e-mail não verificado/suspensa) → 403. */
export class IdentityNotActiveException extends ForbiddenOperationException {
  readonly code = 'IDENTITY_NOT_ACTIVE';

  constructor() {
    super('Identity is not active. Verify your email to activate the account.');
  }
}

/** DOC-002: lockout após N tentativas inválidas → 429. */
export class AccountLockedException extends DomainException {
  readonly code = 'ACCOUNT_LOCKED';
  override readonly httpStatus = 429;

  constructor() {
    super('Account temporarily locked due to failed login attempts. Try again later.');
  }
}
