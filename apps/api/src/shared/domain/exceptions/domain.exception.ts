/**
 * Base das exceções de negócio da plataforma (DOC-001/DOC-003).
 * Cada módulo cria subclasses específicas (ex.: IdentityNotFoundException) —
 * nunca lançar exceção genérica para regra de negócio.
 * O GlobalExceptionFilter converte para o envelope { success: false, error: { code, message } }.
 */
export abstract class DomainException extends Error {
  abstract readonly code: string;
  readonly httpStatus: number = 422;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Recurso inexistente ou fora do escopo do chamador → 404. */
export abstract class EntityNotFoundException extends DomainException {
  override readonly httpStatus = 404;
}

/** Operação válida, mas conflita com o estado atual do recurso → 409. */
export abstract class StateConflictException extends DomainException {
  override readonly httpStatus = 409;
}

/** Violação de regra de negócio → 422 (INCONSISTENCIAS #23). */
export abstract class BusinessRuleViolationException extends DomainException {
  override readonly httpStatus = 422;
}

/** Autenticado, porém sem permissão/ownership sobre o recurso → 403. */
export abstract class ForbiddenOperationException extends DomainException {
  override readonly httpStatus = 403;
}
