import { useState, type SubmitEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { register } from '@/api/auth'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
    <AuthLayout>
      <Card className="w-full max-w-sm gap-6 py-8 shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-semibold">
            Create your account
          </CardTitle>
          <CardDescription>Enter your email and a password to get started</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FieldGroup>
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
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="h-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>

              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>

            <Button type="submit" variant="brand" className="h-10 w-full" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Sign up'}
            </Button>
          </form>

          <Separator />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
              Login here
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
