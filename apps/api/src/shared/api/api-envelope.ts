export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

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
