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

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth && tokenStore.access) {
    headers.authorization = `Bearer ${tokenStore.access}`;
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json()) as
    | { success: true; data: T }
    | { success: false; error: ApiErrorBody };

  if (!payload.success) {
    throw new ApiError(
      response.status,
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  }
  return payload.data;
}

/** Requisição pública (sem Bearer). */
export function api<T>(path: string, options: Omit<RequestOptions, 'auth'> = {}): Promise<T> {
  return rawRequest<T>(path, options);
}

/** Requisição autenticada; em 401 tenta um refresh e repete uma vez. */
export async function authApi<T>(
  path: string,
  options: Omit<RequestOptions, 'auth'> = {},
): Promise<T> {
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
    const data = await rawRequest<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tokenStore.refresh },
    });
    tokenStore.set(data.accessToken, data.refreshToken);
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
