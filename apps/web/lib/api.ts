/**
 * Client da API da Trust Platform (envelope {success, data} / {success:false, error}).
 * Tokens em localStorage; em 401 numa rota autenticada, tenta refresh (rotação) uma vez.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Array<{ path: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

const ACCESS_KEY = 'trust.accessToken';
const REFRESH_KEY = 'trust.refreshToken';

export const tokenStore = {
  get access(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Resposta paginada: a API emite `pagination` como irmão de `data`. */
export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** Enviado como multipart; ignora `body`. */
  form?: FormData;
}

interface RawResult<T> {
  data: T;
  pagination?: PaginationMeta;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<RawResult<T>> {
  const headers: Record<string, string> = {};
  if (!options.form) {
    headers['content-type'] = 'application/json';
  }
  if (options.auth && tokenStore.access) {
    headers.authorization = `Bearer ${tokenStore.access}`;
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });

  if (response.status === 204) {
    return { data: undefined as T };
  }
  const payload = (await response.json()) as
    | { success: true; data: T; pagination?: PaginationMeta }
    | { success: false; error: ApiErrorBody };

  if (!payload.success) {
    throw new ApiError(
      response.status,
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  }
  return { data: payload.data, pagination: payload.pagination };
}

/** Monta querystring ignorando valores vazios. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Requisição pública (sem Bearer). */
export async function api<T>(path: string, options: Omit<RequestOptions, 'auth'> = {}): Promise<T> {
  const result = await rawRequest<T>(path, options);
  return result.data;
}

/** Requisição autenticada; em 401 tenta um refresh e repete uma vez. */
export async function authApi<T>(
  path: string,
  options: Omit<RequestOptions, 'auth'> = {},
): Promise<T> {
  const result = await authRaw<T>(path, options);
  return result.data;
}

/** Variante que preserva o bloco `pagination` das listagens. */
export async function authApiPaged<T>(
  path: string,
  options: Omit<RequestOptions, 'auth'> = {},
): Promise<Paginated<T>> {
  const result = await authRaw<T[]>(path, options);
  return {
    items: result.data,
    pagination: result.pagination ?? {
      page: 1,
      pageSize: result.data.length,
      totalItems: result.data.length,
      totalPages: 1,
    },
  };
}

async function authRaw<T>(
  path: string,
  options: Omit<RequestOptions, 'auth'>,
): Promise<RawResult<T>> {
  try {
    return await rawRequest<T>(path, { ...options, auth: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && tokenStore.refresh) {
      await refreshSession();
      return rawRequest<T>(path, { ...options, auth: true });
    }
    throw error;
  }
}

async function refreshSession(): Promise<void> {
  try {
    const result = await rawRequest<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken: tokenStore.refresh } },
    );
    tokenStore.set(result.data.accessToken, result.data.refreshToken);
  } catch (error) {
    tokenStore.clear();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  try {
    await authApi<void>('/auth/logout', { method: 'POST' });
  } catch {
    // sessão já inválida — segue a limpeza local
  } finally {
    tokenStore.clear();
  }
}

export interface CurrentIdentity {
  identityId: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}
