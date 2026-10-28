// ==========================================
// 1. CONFIGURATION & CUSTOM ERROR HANDLING
// ==========================================

const BASE_URL = import.meta.env.VITE_API_URL

if (!BASE_URL) {
  throw new Error('API configuration error: VITE_API_URL is missing')
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// FastAPI errors: {detail: "msg"} or {detail: [{msg, loc}, ...]}
interface ErrorBody {
  detail?: string | { msg: string }[]
}

function errorMessage(body: ErrorBody | null, status: number): string {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((e) => e.msg).join('; ')
  return `Request failed (${status})`
}

// ==========================================
// 2. IN-MEMORY STATE & REACT EXPORTS
// ==========================================

// The access token lives in memory only: an XSS script can't read it from
// storage, and a page reload clears it (the refresh cookie restores it).
let accessToken: string | null = null
let onAuthFailure: () => void = () => {}
let refreshPromise: Promise<string> | null = null

export const setAccessToken = (token: string | null): void => {
  accessToken = token
}

// AuthProvider registers this so client.ts stays free of React.
export const setAuthFailureHandler = (fn: () => void): void => {
  onAuthFailure = fn
}

// ==========================================
// 3. INTERNAL REQUEST MECHANICS & LOCKS
// ==========================================

interface TokenResponse {
  access_token: string
  token_type: string
}

interface RawOptions {
  method?: string
  json?: unknown
  form?: Record<string, string>
  token?: string | null
}

// One HTTP call, no auth logic and no retries. Always throws ApiError on failure.
async function rawRequest<T>(
  path: string,
  { method = 'GET', json, form, token }: RawOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = new URLSearchParams(form) // browser sets the form-encoded Content-Type
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    // credentials: 'include' lets the browser store and send the refresh cookie.
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?')
  }

  // 204 has no body; error responses may not be JSON (e.g. a proxy's 502 page).
  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, errorMessage(data as ErrorBody | null, response.status))
  // Trusting the backend's shape here; validate with zod at this boundary if it ever drifts.
  return data as T
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  // One refresh at a time across tabs. Tabs share the cookie jar, so a tab that
  // waits for the lock then sends the already-rotated cookie and succeeds.
  return navigator.locks ? navigator.locks.request('auth-refresh', fn) : fn()
}

// Single-flight: callers that arrive during a refresh share the same promise.
// A second concurrent refresh would replay a rotated token and the backend
// would treat it as theft and revoke every session.
export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= withRefreshLock(async () => {
    const data = await rawRequest<TokenResponse>('/auth/refresh', { method: 'POST' })
    accessToken = data.access_token
    return data.access_token
  }).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

// ==========================================
// 4. MAIN EXPORTED WRAPPER (INTERCEPTOR)
// ==========================================

interface RequestOptions {
  method?: string
  json?: unknown
  form?: Record<string, string>
  // false for login/register, where a 401 means "wrong credentials", not "token expired".
  auth?: boolean
}

export async function request<T>(
  path: string,
  { method = 'GET', json, form, auth = true }: RequestOptions = {},
): Promise<T> {
  const send = () => rawRequest<T>(path, { method, json, form, token: auth ? accessToken : null })
  const tokenUsed = accessToken // what the first attempt carries

  try {
    return await send()
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !auth) throw err
  }

  // Another request refreshed while this one was in flight: just retry with the
  // new token. Refreshing again would rotate the refresh token for nothing.
  if (accessToken !== null && accessToken !== tokenUsed) return send()

  // Authenticated call got a 401: refresh once, retry once.
  try {
    await refreshAccessToken()
  } catch (err) {
    // Only a rejected refresh token ends the session. A network blip or a 5xx
    // must not log the user out; let the caller show that error instead.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      accessToken = null
      onAuthFailure()
      throw new ApiError(401, 'Session expired. Please log in again.')
    }
    throw err
  }
  return send()
}