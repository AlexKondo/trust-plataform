import {
  EntityNotFoundException,
  StateConflictException,
} from '../../../../shared/domain/exceptions/domain.exception';

/** TPS-001 BR-002: 1 Passport por Identity → 409. */
export class TrustPassportAlreadyExistsException extends StateConflictException {
  readonly code = 'TRUST_PASSPORT_ALREADY_EXISTS';

  constructor() {
    super('A Trust Passport already exists for this identity.');
  }
}

export class TrustPassportNotFoundException extends EntityNotFoundException {
  readonly code = 'TRUST_PASSPORT_NOT_FOUND';

  constructor() {
    super('Trust Passport not found.');
  }
}
