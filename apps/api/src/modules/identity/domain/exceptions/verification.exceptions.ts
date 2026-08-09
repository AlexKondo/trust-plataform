import {
  DomainException,
  EntityNotFoundException,
  StateConflictException,
} from '../../../../shared/domain/exceptions/domain.exception';

/** BR-006 do IDN-002: token inválido/expirado → HTTP 400 (a spec vence o mapeamento genérico). */
export class InvalidVerificationTokenException extends DomainException {
  readonly code = 'INVALID_VERIFICATION_TOKEN';
  override readonly httpStatus = 400;

  constructor() {
    super('Invalid verification token.');
  }
}

export class ExpiredVerificationTokenException extends DomainException {
  readonly code = 'EXPIRED_VERIFICATION_TOKEN';
  override readonly httpStatus = 400;

  constructor() {
    super('Verification token has expired.');
  }
}

/** BR-004: e-mail já verificado não pode reutilizar token → 409. */
export class EmailAlreadyVerifiedException extends StateConflictException {
  readonly code = 'EMAIL_ALREADY_VERIFIED';

  constructor() {
    super('Email is already verified.');
  }
}

export class IdentityNotFoundException extends EntityNotFoundException {
  readonly code = 'IDENTITY_NOT_FOUND';

  constructor() {
    super('Identity not found.');
  }
}
