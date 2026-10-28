import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Wait for the session check: without this, a logged-in user reloading the
  // page would be bounced to /login before the refresh cookie is read.
  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading…</div>
  }

  // Remember where they were going so login can send them back.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}
