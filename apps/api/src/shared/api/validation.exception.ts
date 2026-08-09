import { ZodError } from 'zod';

/** Falha de validação sintática (formato/obrigatoriedade/enum) → 400 VALIDATION_ERROR. */
export class ValidationException extends Error {
  readonly details: Array<{ path: string; message: string }>;

  constructor(error: ZodError) {
    super('Request validation failed.');
    this.name = 'ValidationException';
    this.details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }
}
