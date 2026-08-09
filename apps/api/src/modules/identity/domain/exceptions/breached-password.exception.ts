import { BusinessRuleViolationException } from '../../../../shared/domain/exceptions/domain.exception';

/** Senha presente em vazamentos públicos conhecidos → 422. */
export class BreachedPasswordException extends BusinessRuleViolationException {
  readonly code = 'PASSWORD_BREACHED';

  constructor() {
    super(
      'This password has appeared in known data breaches. Please choose a different password.',
    );
  }
}
