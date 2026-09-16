import {
  EntityNotFoundException,
  ForbiddenOperationException,
} from '../../../../shared/domain/exceptions/domain.exception';

export class PrivacyRequestNotFoundException extends EntityNotFoundException {
  readonly code = 'PRIVACY_REQUEST_NOT_FOUND';

  constructor() {
    super('Privacy request not found.');
  }
}

/** Ownership só do próprio titular — nunca de outra Identity (não-admin) → 403. */
export class PrivacyRequestAccessDeniedException extends ForbiddenOperationException {
  readonly code = 'PRIVACY_REQUEST_ACCESS_DENIED';

  constructor() {
    super('You are not allowed to access this privacy request.');
  }
}

/**
 * IP-021 — nota de design: uma DATA_DELETION bloqueada por obrigação
 * financeira/de execução em aberto NÃO lança exceção — o pedido de exclusão
 * em si é sempre aceito e registrado (201, `PrivacyRequest` com
 * `status: REJECTED` e `rejectionReason` em código estável). Isto é uma
 * trava de ENGENHARIA (proteger a integridade referencial/o estado de uma
 * máquina de estados em andamento), não uma alegação jurídica sobre o que a
 * lei exige reter — ver `DeletionEligibilityService` e o Completion Report
 * §8 para a distinção explícita.
 */
