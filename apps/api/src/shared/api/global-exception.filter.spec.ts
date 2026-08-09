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

function hostFor(reply: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ id: 'req-1', url: '/api/v1/test' }),
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  it('DomainException 404 → envelope com código estável', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new IdentityNotFoundException(), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'IDENTITY_NOT_FOUND', message: 'Identity not found.' },
    });
  });

  it('StateConflictException → 409', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new ListingAlreadyReservedException(), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(409);
  });

  it('ValidationException → 400 VALIDATION_ERROR com details', () => {
    const { filter, reply } = makeFilter();
    const parse = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    if (parse.success) throw new Error('expected failure');
    filter.catch(new ValidationException(parse.error), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(400);
    const body = reply.send.mock.calls[0]?.[0] as {
      error: { code: string; details: unknown[] };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(1);
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
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access token.' },
    });
  });

  it('erro desconhecido → 500 INTERNAL_ERROR sem vazar detalhes', () => {
    const { filter, reply } = makeFilter();
    filter.catch(new Error('secret database failure at /infra/path'), hostFor(reply));
    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
  });
});
