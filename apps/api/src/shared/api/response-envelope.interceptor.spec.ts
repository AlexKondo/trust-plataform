import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PaginatedResult } from './api-envelope';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function contextWithStatus(statusCode: number): ExecutionContext {
  return {
    switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('envelopa resposta de sucesso em { success: true, data }', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(contextWithStatus(200), handlerReturning({ id: 'abc' })),
    );
    expect(result).toEqual({ success: true, data: { id: 'abc' } });
  });

  it('normaliza retorno undefined para data: null', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(contextWithStatus(200), handlerReturning(undefined)),
    );
    expect(result).toEqual({ success: true, data: null });
  });

  it('emite bloco pagination irmão de data para PaginatedResult', async () => {
    const paginated = PaginatedResult.of([{ id: 1 }, { id: 2 }], 1, 20, 87);
    const result = await firstValueFrom(
      interceptor.intercept(contextWithStatus(200), handlerReturning(paginated)),
    );
    expect(result).toEqual({
      success: true,
      data: [{ id: 1 }, { id: 2 }],
      pagination: { page: 1, pageSize: 20, totalItems: 87, totalPages: 5 },
    });
  });

  it('não envelopa respostas 204 (sem corpo)', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(contextWithStatus(204), handlerReturning(undefined)),
    );
    expect(result).toBeUndefined();
  });
});
