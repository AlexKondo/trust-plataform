import {
  DomainException,
  EntityNotFoundException,
} from '../../../../shared/domain/exceptions/domain.exception';

export class SessionNotFoundException extends EntityNotFoundException {
  readonly code = 'SESSION_NOT_FOUND';

  constructor() {
    super('Session not found.');
  }
}

/** IDN-006: logout de sessão já revogada → 401 (o cliente deve limpar tokens e ir ao /login). */
export class SessionAlreadyRevokedException extends DomainException {
  readonly code = 'SESSION_ALREADY_REVOKED';
  override readonly httpStatus = 401;

  constructor() {
    super('Session has already been revoked.');
  }
}
