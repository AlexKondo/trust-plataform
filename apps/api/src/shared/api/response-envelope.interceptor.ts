import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Observable, map } from 'rxjs';
import { ApiSuccessEnvelope, PaginatedResult } from './api-envelope';

/**
 * Envelopa toda resposta de sucesso em { success: true, data } (DOC-003).
 * Controllers retornam dados puros (DTOs) — nunca montam o envelope manualmente.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        const reply = context.switchToHttp().getResponse<FastifyReply>();
        if (reply.statusCode === 204) {
          return undefined;
        }
        if (data instanceof PaginatedResult) {
          const envelope: ApiSuccessEnvelope<unknown> = {
            success: true,
            data: data.items,
            pagination: data.pagination,
          };
          return envelope;
        }
        const envelope: ApiSuccessEnvelope<unknown> = { success: true, data: data ?? null };
        return envelope;
      }),
    );
  }
}
