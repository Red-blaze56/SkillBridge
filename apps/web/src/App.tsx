import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AuthUser } from '@skillbridge/shared';
import { AppShell } from './components/layout/AppShell.tsx';
import { InterviewNewPage } from './pages/InterviewNewPage.tsx';
import { InterviewPage } from './pages/InterviewPage.tsx';
import { InterviewsPage } from './pages/InterviewsPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { ReadinessPage } from './pages/ReadinessPage.tsx';
import { ResumePage } from './pages/ResumePage.tsx';
import { setUnauthorizedHandler } from './api.ts';
import { getMe } from './services/auth.ts';

type Session =
  | { kind: 'checking' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; user: AuthUser };

export function App() {
  const [session, setSession] = useState<Session>({ kind: 'checking' });

  useEffect(() => {
    // Any 401 means the session cookie is gone or expired: show the sign-in page.
    setUnauthorizedHandler(() => setSession({ kind: 'signedOut' }));
    void getMe()
      .then((user) => setSession({ kind: 'signedIn', user }))
      .catch(() => setSession({ kind: 'signedOut' }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signedIn = (user: AuthUser) => setSession({ kind: 'signedIn', user });

  if (session.kind === 'checking') {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper text-ink">
        <p className="micro">Restoring your session…</p>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Invite and reset links work signed in or out: they sign in as the link's account. */}
        <Route path="/invite" element={<LoginPage onSignedIn={signedIn} />} />
        <Route path="/reset" element={<LoginPage onSignedIn={signedIn} />} />

        {session.kind === 'signedOut' ? (
          <Route path="*" element={<LoginPage onSignedIn={signedIn} />} />
        ) : (
          <>
            <Route
              element={
                <AppShell
                  user={session.user}
                  onSignedOut={() => setSession({ kind: 'signedOut' })}
                />
              }
            >
              <Route index element={<OverviewPage user={session.user} />} />
              <Route path="resume" element={<ResumePage />} />
              <Route path="readiness" element={<ReadinessPage />} />
              <Route path="interviews" element={<InterviewsPage />} />
              <Route path="interviews/new" element={<InterviewNewPage />} />
              <Route path="interviews/:id" element={<InterviewPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
