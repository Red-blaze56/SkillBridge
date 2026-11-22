import { useEffect, useState, type FormEvent } from 'react';
import { AuthUser, HealthResponse, PASSWORD_MIN_LENGTH } from '@skillbridge/shared';
import { api } from './api.ts';

type Link = { kind: 'invite' | 'reset'; token: string };
type Session = { kind: 'checking' } | { kind: 'signedOut' } | { kind: 'signedIn'; user: AuthUser };

/** An invite or reset link the page was opened with: /invite?token=… or /reset?token=… */
function readLink(): Link | null {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) return null;
  if (window.location.pathname === '/invite') return { kind: 'invite', token };
  if (window.location.pathname === '/reset') return { kind: 'reset', token };
  return null;
}

export function App() {
  const [link, setLink] = useState(readLink);
  const [session, setSession] = useState<Session>({ kind: 'checking' });

  useEffect(() => {
    if (link) return;
    void api('/api/me').then((res) =>
      setSession(res.ok ? { kind: 'signedIn', user: AuthUser.parse(res.data) } : { kind: 'signedOut' }),
    );
  }, [link]);

  const signedIn = (user: AuthUser) => {
    // Drop the token from the address bar and history once it's used.
    window.history.replaceState(null, '', '/');
    setLink(null);
    setSession({ kind: 'signedIn', user });
  };

  return (
    <main>
      <h1>SkillBridge</h1>
      {link ? (
        <SetPasswordForm link={link} onDone={signedIn} />
      ) : session.kind === 'checking' ? (
        <p>Loading…</p>
      ) : session.kind === 'signedOut' ? (
        <LoginForm onDone={signedIn} />
      ) : (
        <SignedIn user={session.user} onSignOut={() => setSession({ kind: 'signedOut' })} />
      )}
      <ApiStatus />
    </main>
  );
}

function LoginForm({ onDone }: { onDone: (user: AuthUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    });
    setBusy(false);
    if (res.ok) onDone(AuthUser.parse(res.data));
    else setError(res.error);
  }

  return (
    <form onSubmit={submit}>
      <h2>Sign in</h2>
      <label>
        Email <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>Sign in</button>
      <p className="hint">No account? Ask for an invite link. Forgot your password? Ask for a reset link.</p>
    </form>
  );
}

function SetPasswordForm({ link, onDone }: { link: Link; onDone: (user: AuthUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== form.get('confirm')) {
      setError('The two passwords are different');
      return;
    }
    setBusy(true);
    const path = link.kind === 'invite' ? '/api/auth/accept-invite' : '/api/auth/reset-password';
    const res = await api(path, { method: 'POST', body: { token: link.token, password } });
    setBusy(false);
    if (res.ok) onDone(AuthUser.parse(res.data));
    else setError(res.error);
  }

  return (
    <form onSubmit={submit}>
      <h2>{link.kind === 'invite' ? 'Create your account' : 'Choose a new password'}</h2>
      <label>
        Password <input name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </label>
      <label>
        Repeat password <input name="confirm" type="password" autoComplete="new-password" required />
      </label>
      <p className="hint">At least {PASSWORD_MIN_LENGTH} characters. A few unrelated words work well.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{link.kind === 'invite' ? 'Create account' : 'Save password'}</button>
    </form>
  );
}

function SignedIn({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' });
    onSignOut();
  }
  return (
    <section>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>
      <button onClick={signOut}>Sign out</button>
    </section>
  );
}

function ApiStatus() {
  const [text, setText] = useState('Checking the API…');
  useEffect(() => {
    void api('/api/health').then((res) =>
      setText(res.ok ? `API is up · database ${HealthResponse.parse(res.data).database}` : 'API is unreachable'),
    );
  }, []);
  return <p className="hint">{text}</p>;
}
