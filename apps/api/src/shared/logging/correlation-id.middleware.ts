import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  requestIdOf,
  resolveCorrelationId,
} from './correlation';

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

type RequestWithContext = IncomingMessage & { id?: unknown; requestContext?: RequestContext };

/**
 * Propaga Request ID + Correlation ID: anexa ao request (para use cases,
 * auditoria e eventos) e devolve nos headers da resposta.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: ServerResponse, next: () => void): void {
    const requestId = requestIdOf(req);
    const correlationId = resolveCorrelationId(req);

    req.requestContext = { requestId, correlationId };

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
