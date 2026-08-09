import { validate as isUuid } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

interface RequestLike {
  id?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** Extrai o Request ID gerado pelo Fastify (genReqId) como string segura. */
export function requestIdOf(req: { id?: unknown }): string {
  return typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : '';
}

/**
 * Correlation ID determinístico: header `x-correlation-id` válido quando o chamador
 * propaga um rastreio existente; caso contrário, o próprio Request ID inicia a cadeia.
 * A mesma função é usada no logger e no middleware para nunca divergirem.
 */
export function resolveCorrelationId(req: RequestLike): string {
  const incoming = req.headers[CORRELATION_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  if (candidate && isUuid(candidate)) {
    return candidate;
  }
  return requestIdOf(req);
}
