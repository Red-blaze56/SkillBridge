import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthUser, ResumeSummary } from '@skillbridge/shared';
import { listResumes } from '../services/resumes.ts';
import { getHealth } from '../services/health.ts';
import { count, longDate, shortDate } from '../lib/format.ts';

export function OverviewPage({ user }: { user: AuthUser }) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [database, setDatabase] = useState<'up' | 'down'>('down');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([listResumes(), getHealth()])
      .then(([items, health]) => {
        setResumes(items);
        setDatabase(health.database);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const latest = resumes[0];

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Career workspace · {longDate()}</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            Welcome back.
            <br />
            <em className="italic text-muted">Here is where you stand.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            Keep your resume evidence organized and ready for analysis.
          </p>
        </div>
        <Link to="/resume" className="inline-flex min-h-11 items-center justify-center gap-2 border border-ink bg-ink px-5 py-3 text-[13px] font-medium text-paper">
          Manage resume <ArrowRight size={14} />
        </Link>
      </header>

      <section className="grid border border-line bg-card sm:grid-cols-3 sm:divide-x sm:divide-line">
        <div className="border-b border-line p-6 sm:border-b-0">
          <p className="micro">Account</p>
          <p className="mt-3 break-all font-serif text-2xl leading-tight">{user.email}</p>
          <p className="mt-3 text-[11px] text-muted">Invite-only workspace</p>
        </div>
        <div className="border-b border-line p-6 sm:border-b-0">
          <p className="micro">Saved resumes</p>
          <p className="display mt-3 text-6xl tabular-nums">{loading ? '—' : resumes.length}</p>
          <p className="mt-3 text-[11px] text-muted">Up to 5 resumes kept</p>
        </div>
        <div className="p-6">
          <p className="micro">Database</p>
          <p className="mt-3 flex items-center gap-2 font-serif text-2xl">
            <ShieldCheck size={18} />
            {loading ? 'Checking' : database === 'up' ? 'Connected' : 'Unavailable'}
          </p>
          <p className="mt-3 text-[11px] text-muted">MongoDB service status</p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="border border-line bg-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="micro">Resume evidence</p>
              <h2 className="font-serif text-2xl">Latest resume</h2>
            </div>
            <FileText size={18} className="text-muted" />
          </div>
          {latest ? (
            <Link to="/resume" className="mt-5 block border-t border-line py-4 first:border-t-0">
              <p className="text-[13px] font-medium">{latest.fileName}</p>
              <p className="mt-1 text-[11px] text-muted">
                {shortDate(latest.uploadedAt)} · {count(latest.pageCount, 'page')} ·{' '}
                {count(latest.passageCount, 'passage')}
              </p>
            </Link>
          ) : (
            <p className="mt-5 text-xs text-muted">
              {loading ? 'Loading resumes…' : 'No resume uploaded yet.'}
            </p>
          )}
          <Link to="/resume" className="mt-3 inline-flex items-center gap-1 text-xs underline underline-offset-4">
            Manage resume <ArrowRight size={12} />
          </Link>
        </section>

        <section className="border border-line bg-card p-6">
          <p className="micro">Product status</p>
          <h2 className="mt-2 font-serif text-2xl">Built for the next step</h2>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Resume parsing, hidden-text screening, readiness scoring and skill gaps work on the
            server. Their screens, mock interviews and job matches come next.
          </p>
        </section>
      </div>
    </div>
  );
}
