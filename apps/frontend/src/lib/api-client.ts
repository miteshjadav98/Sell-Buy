import type { ApiEnvelope, ApiErrorEnvelope, AuthTokens, Paginated } from '@/types/api';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000/api/v1';

/**
 * A domain error from the API, carrying the stable `code` clients switch on.
 *
 * The backend's own comment is worth honouring here: the code matters more than
 * the message, because messages get reworded without warning and codes do not.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the customer can fix it by changing something on screen. */
  get isActionable(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/**
 * The access token lives in a module variable and nowhere else.
 *
 * Not localStorage, not a readable cookie — any script that runs on the page can
 * read those, so one XSS anywhere becomes a stolen session that outlives the
 * tab. In memory it dies with the page, and the httpOnly refresh cookie the API
 * set is what survives a reload. That cookie is unreadable to JavaScript by
 * design, which is why `bootstrapSession()` below asks the server rather than
 * looking it up locally.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Lets the auth store clear itself when a refresh finally fails. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

/**
 * One in-flight refresh at a time.
 *
 * Without this, a page that fires five queries on mount produces five parallel
 * refreshes. Since refresh tokens rotate on every use, four of them present a
 * token that has just been superseded — which the API is right to treat as
 * replay, and which would log the user out for the crime of loading a page.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        // The refresh token rides in the httpOnly cookie; nothing to send.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!response.ok) return false;

      const body = (await response.json()) as ApiEnvelope<AuthTokens>;
      accessToken = body.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this promise all observe
      // the same result before a new attempt can start.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Appended as a query string; undefined and empty values are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Skips the 401→refresh→retry dance. Used by the refresh call itself. */
  skipAuthRetry?: boolean;
  signal?: AbortSignal;
  /** Server components pass `no-store`; the browser uses the default. */
  cache?: RequestCache;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN_ERROR';
  let message = `Request failed with status ${response.status}`;
  let details: unknown;

  try {
    const body = (await response.json()) as ApiErrorEnvelope;
    if (body?.error) {
      code = body.error.code;
      message = body.error.message;
      details = body.error.details;
    }
  } catch {
    // A non-JSON body (a proxy error page, a dropped connection) keeps the
    // defaults above rather than throwing a parse error over the real failure.
  }

  return new ApiError(code, message, response.status, details);
}

/**
 * The single fetch path for the whole app.
 *
 * `credentials: 'include'` on every call is load-bearing: the guest cart is
 * identified by an httpOnly `sb_cart` cookie the API sets, so omitting it would
 * silently give every request a brand-new empty cart.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, params, headers = {}, skipAuthRetry, signal, cache } = options;

  const send = async (): Promise<Response> =>
    fetch(buildUrl(path, params), {
      method,
      credentials: 'include',
      signal,
      ...(cache ? { cache } : {}),
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response = await send();

  // One retry, and only one: if a fresh token still gets 401, the session is
  // genuinely gone and looping would just hammer the endpoint.
  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await send();
    } else {
      accessToken = null;
      onUnauthenticated?.();
    }
  }

  if (!response.ok) throw await toApiError(response);

  // 204 has no body to parse.
  if (response.status === 204) {
    return { success: true, data: undefined as T, correlationId: '', timestamp: '' };
  }

  return (await response.json()) as ApiEnvelope<T>;
}

/** Unwraps the envelope — callers want the payload, not the wrapper. */
export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, { ...options, method: 'GET' })).data;
}

export async function apiPost<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, { ...options, method: 'POST', body })).data;
}

export async function apiPatch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, { ...options, method: 'PATCH', body })).data;
}

export async function apiPut<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, { ...options, method: 'PUT', body })).data;
}

export async function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, { ...options, method: 'DELETE' })).data;
}

/**
 * Paginated endpoints hoist `items` into `data` and pagination into `meta`, so
 * they need the envelope reassembled rather than unwrapped.
 */
export async function apiGetPaginated<T>(
  path: string,
  options?: RequestOptions,
): Promise<Paginated<T>> {
  const envelope = await request<T[]>(path, { ...options, method: 'GET' });
  return {
    items: envelope.data ?? [],
    meta: envelope.meta ?? { limit: 0, hasNext: false },
  };
}

/**
 * Restores the session on a full page load.
 *
 * The access token died with the previous page, but the httpOnly refresh cookie
 * did not — so the only way to find out whether someone is signed in is to ask.
 * A failure here is the normal case for a signed-out visitor, not an error.
 */
export async function bootstrapSession(): Promise<boolean> {
  return refreshAccessToken();
}
