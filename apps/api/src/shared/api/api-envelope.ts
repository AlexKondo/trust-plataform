export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

/**
 * Corpo canônico de erro — PACK-00 v1.1 §6.
 * `details` permanece o array opcional de { path, message } (decisão v1.1).
 * `requestId` e `correlationId` espelham o RequestContext e os headers
 * x-request-id / x-correlation-id.
 */
export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
    requestId: string;
    correlationId: string;
  };
}

/** Erro montado pelos tradutores de exceção, antes de receber os IDs de rastreio. */
export type ApiErrorBody = Omit<ApiErrorEnvelope['error'], 'requestId' | 'correlationId'>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Retorne uma instância desta classe no controller para que o
 * ResponseEnvelopeInterceptor emita o bloco `pagination` irmão de `data`.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly pagination: PaginationMeta,
  ) {}

  static of<T>(items: T[], page: number, pageSize: number, totalItems: number): PaginatedResult<T> {
    return new PaginatedResult(items, {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    });
  }
}
