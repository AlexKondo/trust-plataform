import {
  BusinessRuleViolationException,
  DomainException,
  EntityNotFoundException,
  ForbiddenOperationException,
  StateConflictException,
} from '../../../../shared/domain/exceptions/domain.exception';

export class VerificationNotFoundException extends EntityNotFoundException {
  readonly code = 'VERIFICATION_NOT_FOUND';

  constructor() {
    super('Verification not found.');
  }
}

/** VRF-001 BR-003: 1 verificação ativa por Passport+tipo → 409. */
export class ActiveVerificationExistsException extends StateConflictException {
  readonly code = 'VERIFICATION_ALREADY_EXISTS';

  constructor() {
    super('An active verification of this type already exists for this passport.');
  }
}

/** VRF-001 BR-002 → 422. */
export class UnsupportedVerificationTypeException extends BusinessRuleViolationException {
  readonly code = 'UNSUPPORTED_VERIFICATION_TYPE';

  constructor(type: string) {
    super(`Verification type "${type}" is not supported.`);
  }
}

/** Transição fora da máquina de estados → 409 (VRF-002..005). */
export class InvalidVerificationStatusException extends StateConflictException {
  readonly code = 'INVALID_VERIFICATION_STATUS';

  constructor(current: string, expected: string) {
    super(`Verification is ${current}; this operation requires ${expected}.`);
  }
}

/** VRF-002 BR-002: tipo de evidência não requerido pelo tipo da verificação → 422. */
export class EvidenceTypeNotRequiredException extends BusinessRuleViolationException {
  readonly code = 'EVIDENCE_TYPE_NOT_REQUIRED';

  constructor(evidenceType: string, verificationType: string) {
    super(`Evidence type "${evidenceType}" is not required for ${verificationType} verification.`);
  }
}

/** VRF-002 BR-003 → 413. */
export class EvidenceFileTooLargeException extends DomainException {
  readonly code = 'FILE_TOO_LARGE';
  override readonly httpStatus = 413;

  constructor(maxBytes: number) {
    super(`Evidence file exceeds the maximum allowed size of ${maxBytes} bytes.`);
  }
}

/** VRF-002 BR-003 → 415. */
export class UnsupportedMediaTypeException extends DomainException {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
  override readonly httpStatus = 415;

  constructor(mimeType: string) {
    super(`Media type "${mimeType}" is not allowed for verification evidence.`);
  }
}

/** VRF-006 BR-002: dono ou admin → 403. */
export class VerificationAccessDeniedException extends ForbiddenOperationException {
  readonly code = 'VERIFICATION_ACCESS_DENIED';

  constructor() {
    super('You are not allowed to access this verification.');
  }
}
