import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorEnvelope } from './api-envelope';
import { ValidationException } from './validation.exception';
import { DomainException } from '../domain/exceptions/domain.exception';

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

/**
 * Converte qualquer exceção para o envelope { success: false, error: { code, message } }.
 * Nunca expõe stack trace, SQL ou detalhes de infraestrutura ao cliente (DOC-002/003/006).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { status, envelope } = this.toEnvelope(exception);

    if (status >= 500) {
      this.logger.error(
        {
          err: exception,
          requestId: request?.id,
          path: request?.url,
          result: 'FAILURE',
        },
        'Unhandled exception while processing request.',
      );
    } else {
      this.logger.warn(
        {
          errorCode: envelope.error.code,
          requestId: request?.id,
          path: request?.url,
          result: 'FAILURE',
        },
        'Request failed with handled error.',
      );
    }

    void reply.status(status).send(envelope);
  }

  private toEnvelope(exception: unknown): { status: number; envelope: ApiErrorEnvelope } {
    if (exception instanceof DomainException) {
      return {
        status: exception.httpStatus,
        envelope: {
          success: false,
          error: { code: exception.code, message: exception.message },
        },
      };
    }

    if (exception instanceof ValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        envelope: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: exception.message,
            details: exception.details,
          },
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
        return { status, envelope: { success: false, error: { code, message } } };
      }
      return {
        status,
        envelope: {
          success: false,
          error: {
            code: STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
            message: exception.message,
          },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      },
    };
  }
}
