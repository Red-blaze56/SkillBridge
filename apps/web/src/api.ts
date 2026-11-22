/** Where the API lives. Vite proxies /api to the API server in development. */
const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** A JSON body. Ignored when `raw` is set. */
  body?: unknown;
  /** A body sent as-is, such as a PDF file. */
  raw?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Called on any 401 so the app can forget the signed-in user. The session itself
 * is an httpOnly cookie, so there is no token for the page to clear.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function errorMessage(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const { error } = payload as { error: unknown };
    if (typeof error === 'string' && error) return error;
  }
  return null;
}

/** A request to the API. Resolves with the parsed body, or throws ApiError. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.raw !== undefined) {
    body = options.raw;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    throw new ApiError('Could not reach the API. Is it running on port 4000?', 0);
  }

  if (response.status === 401) unauthorizedHandler?.();

  // 204 means "done, nothing to say" — logout and delete answer this way.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  let parsed = false;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
      parsed = true;
    } catch {
      parsed = false;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload) ?? `Request failed (HTTP ${response.status})`,
      response.status,
    );
  }

  if (text && !parsed) {
    throw new ApiError('The API returned a response this page could not read.', response.status);
  }

  return payload as T;
}
