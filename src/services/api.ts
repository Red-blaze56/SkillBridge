const API_BASE = '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('skillbridge_token')
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const text = await response.text()
  let payload: { error?: string } & T
  try {
    payload = text ? JSON.parse(text) as { error?: string } & T : {} as { error?: string } & T
  } catch {
    throw new ApiError(`The API returned an invalid response (HTTP ${response.status}).`, response.status)
  }
  if (response.status === 401) {
    localStorage.removeItem('skillbridge_token')
    window.dispatchEvent(new Event('skillbridge:logout'))
  }
  if (!response.ok) throw new ApiError(payload.error || `Request failed (HTTP ${response.status}).`, response.status)
  return payload
}
