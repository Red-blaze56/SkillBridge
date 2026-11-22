import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@skillbridge/shared';
import { PASSWORD_MIN_LENGTH } from '@skillbridge/shared';
import { acceptInvite, resetPassword, signIn } from '../services/auth.ts';
import { Field } from '../components/ui/Field.tsx';
import { Button } from '../components/ui/Button.tsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.tsx';

export function LoginPage({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const isInvite = location.pathname === '/invite';
  const isReset = location.pathname === '/reset';
  const linkMode = isInvite || isReset;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      let user: AuthUser;
      if (linkMode) {
        if (password !== confirm) throw new Error('The two passwords are different');
        user = isInvite
          ? await acceptInvite(token, password)
          : await resetPassword(token, password);
        window.history.replaceState(null, '', '/');
      } else {
        user = await signIn(email, password);
      }
      onSignedIn(user);
      navigate('/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    ['Evidence, not vibes', 'Every point comes from skills your resume actually proves.'],
    ['One score, explained', 'A deterministic formula shows exactly where the missing points are.'],
    ['Practice where it counts', 'Mock interviews turn the gaps into questions you can rehearse.'],
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="inline-flex items-baseline gap-2">
            <span className="font-serif text-[26px] leading-none tracking-[-0.02em]">
              Skill<span className="italic">Bridge</span>
            </span>
            <span className="micro">BETA</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] flex-1 gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-20">
        <section>
          <p className="micro">Career readiness workspace</p>
          <h1 className="display mt-5 text-[clamp(2.6rem,7vw,4.6rem)]">
            Know your gaps,
            <br />
            <em className="italic">before they ask.</em>
          </h1>
          <p className="measure mt-6 text-sm leading-relaxed text-muted">
            Upload a resume, pick a role, and see exactly what stands between you and the job —
            scored from evidence, not guesswork.
          </p>

          <ol className="mt-12 max-w-lg border-t border-line">
            {steps.map(([title, detail], index) => (
              <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-line py-4">
                <span className="micro pt-0.5">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h2 className="text-[15px] font-medium">{title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:pt-14">
          <div className="border border-line bg-card p-6 sm:p-8">
            <h2 className="display text-3xl">
              {isInvite ? 'Create your account' : isReset ? 'Choose a new password' : 'Sign in'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {linkMode
                ? 'Set a password to continue.'
                : 'Welcome back. Your workspace is waiting.'}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {!linkMode && (
                <>
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Your password"
                    autoComplete="current-password"
                  />
                </>
              )}

              {linkMode && (
                <>
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN_LENGTH}
                  />
                  <Field
                    label="Repeat password"
                    type="password"
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN_LENGTH}
                  />
                </>
              )}

              {error && (
                <p role="alert" className="border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : linkMode ? (isInvite ? 'Create account' : 'Save password') : 'Sign in'}
                {!busy && <ArrowRight size={14} />}
              </Button>
            </form>

            {!linkMode && (
              <p className="mt-5 text-center text-xs text-muted">
                No account? Ask for an invite link. Forgot your password? Ask for a reset link.
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <p className="micro">SkillBridge · evidence-based readiness</p>
          <p className="micro hidden sm:block">Resume → evidence → plan</p>
        </div>
      </footer>
    </div>
  );
}
