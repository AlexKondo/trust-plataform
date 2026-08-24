import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GlobalExceptionFilter } from './global-exception.filter';
import { ValidationException } from './validation.exception';
import {
  EntityNotFoundException,
  StateConflictException,
} from '../domain/exceptions/domain.exception';

class IdentityNotFoundException extends EntityNotFoundException {
  readonly code = 'IDENTITY_NOT_FOUND';
  constructor() {
    super('Identity not found.');
  }
}

class ListingAlreadyReservedException extends StateConflictException {
  readonly code = 'LISTING_ALREADY_RESERVED';
  constructor() {
    super('Listing is already reserved.');
  }
}

const REQUEST_ID = 'req-1';
const CORRELATION_ID = '0198c7e0-0000-7000-8000-000000000001';

function makeFilter(): { filter: GlobalExceptionFilter; reply: { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } } {
  const logger = {
    setContext: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger;
  const send = vi.fn();
  const reply = { status: vi.fn().mockReturnValue({ send }), send };
  return { filter: new GlobalExceptionFilter(logger), reply };
}

/** Request como o CorrelationIdMiddleware o entrega ao resto da aplicação. */
function hostFor(reply: unknown, request?: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () =>
        request ?? {
          id: REQUEST_ID,
          url: '/api/v1/test',
          headers: { 'x-correlation-id': CORRELATION_ID },
          requestContext: { requestId: REQUEST_ID, correlationId: CORRELATION_ID },
        },
    }),
  } as unknown as ArgumentsHost;
}

/** PACK-00 v1.1 §6: todo corpo de erro carrega requestId + correlationId. */
const TRACE = { requestId: REQUEST_ID, correlationId: CORRELATION_ID };

describe('GlobalExceptionFilter', () => {
  it('DomainException 404 → envelope com código estável', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new IdentityNotFoundException(), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'IDENTITY_NOT_FOUND', message: 'Identity not found.', ...TRACE },
    });
  });

  it('StateConflictException → 409', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new ListingAlreadyReservedException(), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(409);
  });

  it('ValidationException → 400 VALIDATION_ERROR com details como ARRAY', () => {
    const { filter, reply } = makeFilter();
    const parse = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    if (parse.success) throw new Error('expected failure');
    filter.catch(new ValidationException(parse.error), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(400);
    const body = reply.send.mock.calls[0]?.[0] as {
      error: { code: string; details: Array<{ path: string; message: string }> };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // PACK-00 v1.1 §6: `details` permanece ARRAY de { path, message } — o
    // frontend faz `details.map(...)` em apps/web/app/register/page.tsx.
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details).toHaveLength(1);
    expect(body.error.details[0]).toMatchObject({ path: 'email' });
  });

  it('HttpException com { code, message } customizado passa direto (ex.: guard)', () => {
    const { filter, reply } = makeFilter();
    filter.catch(
      new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid or expired access token.' }),
      hostFor(reply),
    );
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access token.', ...TRACE },
    });
  });

  it('erro desconhecido → 500 INTERNAL_ERROR sem vazar detalhes', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new Error('secret database failure at /infra/path'), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', ...TRACE },
    });
  });

  it('usa os IDs do RequestContext — os mesmos que vão para os headers', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new IdentityNotFoundException(), hostFor(reply));
    const body = reply.send.mock.calls[0]?.[0] as {
      error: { requestId: string; correlationId: string };
    };
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(body.error.correlationId).toBe(CORRELATION_ID);
  });

  it('sem RequestContext (falha antes do middleware) ainda devolve os dois IDs', () => {
    const { filter, reply } = makeFilter();
    filter.catch(
      new IdentityNotFoundException(),
      hostFor(reply, { id: 'req-early', url: '/api/v1/test', headers: {} }),
    );
    const body = reply.send.mock.calls[0]?.[0] as {
      error: { requestId: string; correlationId: string };
    };
    // sem header propagado, o próprio requestId inicia a cadeia de correlação
    expect(body.error.requestId).toBe('req-early');
    expect(body.error.correlationId).toBe('req-early');
  });
});
