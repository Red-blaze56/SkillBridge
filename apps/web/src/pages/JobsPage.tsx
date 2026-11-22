import { ArrowRight, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Analysis, JobMatch, JobMatches, MatchedSkill, RoleSummary } from '@skillbridge/shared';
import { cn } from '../lib/cn.ts';
import { count, dateTime, shortDate } from '../lib/format.ts';
import { listAnalyses, listRoles } from '../services/analyses.ts';
import { getJobMatches, type Where } from '../services/jobs.ts';

const isAbort = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError';

const PLACES: { value: Where; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'india', label: 'India' },
  { value: 'remote', label: 'Remote' },
];

const asWhere = (value: string | null): Where => (value === 'india' || value === 'remote' ? value : 'any');

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const where = asWhere(params.get('where'));
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [data, setData] = useState<JobMatches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The newest finished analysis for each role: matching uses one role's skills at a time.
  const perRole = useMemo(() => {
    const seen = new Set<string>();
    return (analyses ?? []).filter((a) => a.status === 'done' && !seen.has(a.roleId) && seen.add(a.roleId));
  }, [analyses]);
  const analysisId = params.get('analysis') ?? perRole[0]?.id ?? '';
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listAnalyses(undefined, controller.signal), listRoles()])
      .then(([list, roleList]) => {
        setAnalyses(list);
        setRoles(roleList);
      })
      .catch((reason: unknown) => {
        if (isAbort(reason)) return;
        setAnalyses([]);
        setError(reason instanceof Error ? reason.message : 'Could not load your readiness checks');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (analyses === null) return; // wait for the analyses, so the right one is asked for
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getJobMatches({ analysisId: analysisId || undefined, where }, controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (isAbort(reason)) return;
        setError(reason instanceof Error ? reason.message : 'Could not load job matches');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [analyses, analysisId, where]);

  function update(next: { analysis?: string; where?: Where }) {
    const query = new URLSearchParams(params);
    if (next.analysis !== undefined) query.set('analysis', next.analysis);
    if (next.where !== undefined) {
      if (next.where === 'any') query.delete('where');
      else query.set('where', next.where);
    }
    setParams(query, { replace: true });
  }

  const analysis = data?.analysis ?? null;

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Job matching</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            Jobs.
            <br />
            <em className="italic text-muted">Matched to what your resume shows.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            Developer jobs a fresher can apply for, in India or open to remote work from India, from
            companies’ own job boards. Each one is scored against your readiness check.
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-6 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
          {error}
        </p>
      )}

      {analyses !== null && perRole.length === 0 ? (
        <section className="border border-line bg-card p-6 sm:p-8">
          <p className="micro">First, a readiness check</p>
          <p className="mt-3 text-sm leading-relaxed">
            Jobs are matched against the skills your resume shows, so run a readiness check first.
          </p>
          <Link to="/readiness" className="mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4">
            Check readiness <ArrowRight size={12} />
          </Link>
        </section>
      ) : (
        <>
          <section className="mb-6 grid gap-5 border border-line bg-card p-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="jobs-role" className="micro block">
                Target role
              </label>
              <select
                id="jobs-role"
                value={analysisId}
                onChange={(event) => update({ analysis: event.target.value })}
                className="w-full border border-line bg-transparent px-3 py-3 text-sm outline-none focus:border-ink"
              >
                {perRole.map((a) => (
                  <option key={a.id} value={a.id}>
                    {roleName(a.roleId)} · {a.result?.score ?? '—'} / 100
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="micro mb-1.5">Where</p>
              <div className="flex" role="group" aria-label="Where">
                {PLACES.map((place) => (
                  <button
                    key={place.value}
                    type="button"
                    aria-pressed={where === place.value}
                    onClick={() => update({ where: place.value })}
                    className={cn(
                      'min-h-11 border px-4 text-[12px] transition-colors [&:not(:first-child)]:-ml-px',
                      where === place.value ? 'relative border-ink bg-ink text-paper' : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    {place.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {analysis && (
            <p className="mb-4 text-[11px] text-muted">
              Matched against your{' '}
              <Link to={`/readiness?resume=${analysis.resumeId}&analysis=${analysis.id}`} className="underline underline-offset-4">
                readiness check from {shortDate(analysis.createdAt)}
              </Link>{' '}
              ({roleName(analysis.roleId)}, {analysis.score} / 100).
              {data?.updatedAt && <> Jobs updated {dateTime(data.updatedAt)}.</>}
            </p>
          )}

          {loading && !data ? (
            <p className="text-xs text-muted">Loading matches…</p>
          ) : data && data.updatedAt === null ? (
            <section className="border border-dashed border-line p-6 sm:p-8">
              <p className="micro">No jobs yet</p>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                The job list hasn’t been filled yet. It refreshes every few hours from the companies’
                job boards; check back soon.
              </p>
            </section>
          ) : data && data.matches.length === 0 ? (
            <p className="border border-dashed border-line p-6 text-xs text-muted">
              No matching jobs {where === 'any' ? 'right now' : `${where === 'india' ? 'in India' : 'that are remote'} right now`}.
            </p>
          ) : (
            data && (
              <section className={cn('border border-line bg-card', loading && 'opacity-60')} aria-busy={loading}>
                <p className="micro border-b border-line px-6 py-4">
                  Showing {data.matches.length} of {count(data.total, 'job')}, best match first
                </p>
                <ul>
                  {data.matches.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </ul>
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobMatch }) {
  return (
    <li className="grid gap-4 border-t border-line px-6 py-5 first:border-t-0 sm:grid-cols-[4.5rem_1fr]">
      <div>
        <p className="display text-4xl tabular-nums">{job.score ?? '—'}</p>
        <p className="micro mt-1">{job.score === null ? 'not scored' : 'match'}</p>
      </div>
      <div className="min-w-0">
        <p className="micro">{job.company}</p>
        <p className="mt-1 text-[15px] font-medium">{job.title}</p>
        <p className="mt-1 text-[11px] text-muted">
          {job.location || 'Location not stated'}
          {job.remote && !/remote/i.test(job.location) && <span className="text-ink"> · Remote</span>}
          {' · '}
          {job.experience === null ? 'Experience not stated' : `${job.experience} years`}
          {job.postedAt && <> · Posted {shortDate(job.postedAt)}</>}
        </p>

        <dl className="mt-3 grid gap-1.5 text-[11px]">
          <Skills label="You show" skills={job.strong} tone="text-ok" />
          <Skills label="Only listed" skills={job.weak} tone="text-warn" />
          <Skills label="Missing" skills={job.missing} tone="text-bad" />
          {job.unchecked.length > 0 && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">Not checked:</dt>
              <dd className="text-muted">{job.unchecked.join(', ')}</dd>
            </div>
          )}
        </dl>

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs underline underline-offset-4"
        >
          View job <ExternalLink size={12} />
        </a>
      </div>
    </li>
  );
}

function Skills({ label, skills, tone }: { label: string; skills: MatchedSkill[]; tone: string }) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className={tone}>{label}:</dt>
      <dd>{skills.map((s) => s.name).join(', ')}</dd>
    </div>
  );
}
