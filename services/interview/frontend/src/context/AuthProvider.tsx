import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { ApiError, setAuthFailureHandler } from '../api/client'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<authApi.User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // client.ts calls this when a refresh is rejected mid-session.
    setAuthFailureHandler(() => setUser(null))

    // On page load, memory is empty: the refresh cookie may still hold a session.
    // `cancelled` ignores the result if React unmounts us first (StrictMode does this in dev).
    let cancelled = false
    authApi
      .restoreSession()
      .then((restored) => {
        if (!cancelled) setUser(restored)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // "Nobody is logged in" is not an error (restoreSession returns null for that).
        // This is "we could not find out": server down, 5xx, or a bug.
        if (!(err instanceof ApiError)) console.error(err)
        setError(err instanceof ApiError ? err.message : 'Could not check your session.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password))
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null) // leave the app even if the network call failed
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
