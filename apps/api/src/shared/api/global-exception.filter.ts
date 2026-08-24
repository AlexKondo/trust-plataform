import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorBody, ApiErrorEnvelope } from './api-envelope';
import { ValidationException } from './validation.exception';
import { DomainException } from '../domain/exceptions/domain.exception';
import { RequestContext } from '../logging/correlation-id.middleware';
import { requestIdOf, resolveCorrelationId } from '../logging/correlation';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMIT_EXCEEDED',
};

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

/**
 * Converte qualquer exceção para o envelope { success: false, error: {...} }.
 * Nunca expõe stack trace, SQL ou detalhes de infraestrutura ao cliente (DOC-002/003/006).
 *
 * PACK-00 v1.1 §6: o corpo do erro carrega `requestId` e `correlationId` — os
 * MESMOS valores do RequestContext e dos headers x-request-id/x-correlation-id,
 * para que o usuário possa citar um identificador que existe no log.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<RequestWithContext>();

    const { status, error } = this.toError(exception);
    const { requestId, correlationId } = this.traceOf(request);
    const envelope: ApiErrorEnvelope = {
      success: false,
      error: { ...error, requestId, correlationId },
    };

    if (status >= 500) {
      this.logger.error(
        {
          err: exception,
          requestId,
          correlationId,
          path: request?.url,
          result: 'FAILURE',
        },
        'Unhandled exception while processing request.',
      );
    } else {
      this.logger.warn(
        {
          errorCode: error.code,
          requestId,
          correlationId,
          path: request?.url,
          result: 'FAILURE',
        },
        'Request failed with handled error.',
      );
    }

    void reply.status(status).send(envelope);
  }

  /**
   * O middleware normalmente já resolveu o contexto; o fallback cobre exceções
   * lançadas ANTES dele (ex.: erro de parsing do corpo pelo Fastify).
   */
  private traceOf(request?: RequestWithContext): RequestContext {
    if (request?.requestContext) {
      return request.requestContext;
    }
    if (!request) {
      return { requestId: '', correlationId: '' };
    }
    const requestId = requestIdOf(request);
    const correlationId = request.headers ? resolveCorrelationId(request) : '';
    return { requestId, correlationId: correlationId || requestId };
  }

  private toError(exception: unknown): { status: number; error: ApiErrorBody } {
    if (exception instanceof DomainException) {
      return {
        status: exception.httpStatus,
        error: { code: exception.code, message: exception.message },
      };
    }

    if (exception instanceof ValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: 'VALIDATION_ERROR',
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        'message' in response
      ) {
        const { code, message } = response as { code: string; message: string };
        return { status, error: { code, message } };
      }
      return {
        status,
        error: {
          code: STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
          message: exception.message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    };
  }
}
