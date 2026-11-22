import { useState, type SubmitEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { register } from '@/api/auth'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'

export default function Register() {
  const { user, loading, login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading…</div>
  }
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(email, password)
      // The backend only creates the account, so log in with the same details.
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create your account" description="Enter your email and a password to get started.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="h-11 bg-card"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="Choose a password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 bg-card"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>

          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>

        <Button type="submit" variant="brand" className="h-11 w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
          {!submitting && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
