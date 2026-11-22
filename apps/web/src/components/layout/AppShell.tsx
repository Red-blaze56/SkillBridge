import { ArrowRight, FileText, LayoutDashboard, LogOut } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@skillbridge/shared';
import { signOut } from '../../services/auth.ts';
import { cn } from '../../lib/cn.ts';
import { initials } from '../../lib/format.ts';
import { ThemeToggle } from '../ui/ThemeToggle.tsx';

const items = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Resume', to: '/resume', icon: FileText },
];

export function AppShell({
  user,
  onSignedOut,
}: {
  user: AuthUser;
  onSignedOut: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  async function logout() {
    try {
      await signOut();
    } finally {
      onSignedOut();
      navigate('/login', { replace: true });
    }
  }

  const letters = initials(user.email);

  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line px-6 py-7 lg:flex">
          <Link to="/" className="inline-flex items-baseline gap-2" aria-label="SkillBridge home">
            <span className="font-serif text-[26px] leading-none tracking-[-0.02em]">
              Skill<span className="italic">Bridge</span>
            </span>
            <span className="micro">BETA</span>
          </Link>

          <div className="mt-10 flex items-center gap-3 border-y border-line py-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-ink text-[11px] font-medium text-paper">
              {letters}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user.email}</p>
              <p className="truncate text-[11px] text-muted">Career workspace</p>
            </div>
          </div>

          <p className="micro mt-7">Your workspace</p>
          <nav className="mt-3 flex flex-1 flex-col gap-0.5">
            {items.map(({ label, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 border-l-2 py-2 pl-3 pr-2 text-[13px] transition-colors',
                  location.pathname === to
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:border-line hover:text-ink',
                )}
              >
                <Icon size={16} strokeWidth={1.6} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 text-[12px] text-muted transition-colors hover:text-ink"
          >
            <LogOut size={14} /> Sign out
          </button>
          <p className="micro mt-4">SkillBridge · connected</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-paper/95 px-5 backdrop-blur sm:px-8 lg:px-12">
            <p className="text-xs">
              <span className="text-muted">Workspace</span>
              <span className="mx-2 text-line">/</span>
              <strong>{location.pathname === '/resume' ? 'Resume' : 'Career readiness'}</strong>
            </p>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-[10px]">
                {letters}
              </div>
            </div>
          </header>

          <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-4 py-2 lg:hidden">
            {items.map(({ label, to }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'whitespace-nowrap border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em]',
                  location.pathname === to
                    ? 'border-ink bg-ink text-paper'
                    : 'border-transparent text-muted',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <main className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
            <div className="mx-auto w-full max-w-[1180px]">
              <Outlet />
            </div>
          </main>

          <footer className="border-t border-line px-5 py-4 sm:px-8 lg:px-12">
            <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4">
              <p className="micro">SkillBridge · evidence-based readiness</p>
              <p className="micro hidden sm:block">Resume → evidence → plan <ArrowRight size={10} className="inline" /></p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
