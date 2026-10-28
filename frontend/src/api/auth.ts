import { ApiError, refreshAccessToken, request, setAccessToken } from './client'

// Mirrors the backend's UserOut schema.
export interface User {
  id: string
  email: string
  role: 'admin' | 'user'
  is_verified: boolean
}

interface TokenResponse {
  access_token: string
  token_type: string
}

export function register(email: string, password: string): Promise<User> {
  return request<User>('/auth/register', { method: 'POST', json: { email, password }, auth: false })
}

export function me(): Promise<User> {
  return request<User>('/auth/me')
}

// The backend's login is form-encoded, and its "username" field holds the email.
export async function login(email: string, password: string): Promise<User> {
  const { access_token } = await request<TokenResponse>('/auth/login', {
    method: 'POST',
    form: { username: email, password },
    auth: false,
  })
  setAccessToken(access_token)
  return me()
}

// Uses the refresh cookie, not the access token, hence auth: false.
export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST', auth: false })
  } finally {
    setAccessToken(null) // forget the token even if the call failed
  }
}

// On page load memory is empty; the refresh cookie may still hold a session.
// Returns the user, or null if nobody is logged in.
export async function restoreSession(): Promise<User | null> {
  try {
    await refreshAccessToken()
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null
    throw err // network/server trouble: let the caller show it
  }
  return me()
}