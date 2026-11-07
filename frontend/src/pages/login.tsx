import { useState, type SubmitEvent } from 'react'
import { Check } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'

interface LocationState {
  from?: string
}

// Only follow same-site paths; never let state send the user to another origin.
function safeRedirect(from: string | undefined): string {
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}

export default function Login() {
  const { user, loading, error: sessionError, login } = useAuth()
  const location = useLocation()
  const from = safeRedirect((location.state as LocationState | null)?.from)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Don't flash the form at someone whose session is being restored.
  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading…</div>
  }
  // Already logged in (also what sends you onward right after a successful login).
  if (user) return <Navigate to={from} replace />

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      // user is now set, so the <Navigate> above takes over on the next render.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm gap-6 py-8 shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-semibold">
            Welcome back!
          </CardTitle>
          <CardDescription>Enter your email and password to continue</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              {sessionError && <FieldError>{sessionError}</FieldError>}

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  required
                  className="h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className="h-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>

            <Button type="submit" variant="brand" className="h-10 w-full" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Login'}
            </Button>
          </form>

          <Separator />

          <p className="text-center text-sm text-muted-foreground">
            Not registered?{' '}
            <Link to="/register" className="underline underline-offset-4 hover:text-foreground">
              Sign up here
            </Link>
          </p>

          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {['AI follow-up questions', 'Scored report', 'Your history'].map((item) => (
              <li key={item} className="flex items-center gap-1">
                <Check className="size-3.5 text-foreground" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
