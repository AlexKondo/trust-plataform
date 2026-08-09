import { StateConflictException } from '../../../../shared/domain/exceptions/domain.exception';

/** BR-001/BR-006: um e-mail só pode estar associado a uma Identity → 409. */
export class EmailAlreadyExistsException extends StateConflictException {
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor() {
    super('An identity with this email already exists.');
  }
}
