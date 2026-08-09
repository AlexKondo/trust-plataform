import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ValidationException } from './validation.exception';

/**
 * Validação sintática na borda, antes do Use Case (trust-architecture regra 6).
 * Uso: `@Body(new ZodValidationPipe(createIdentitySchema)) body: CreateIdentityRequest`
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationException(result.error);
    }
    return result.data;
  }
}
