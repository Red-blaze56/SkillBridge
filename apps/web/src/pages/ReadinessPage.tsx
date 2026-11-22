import { ArrowRight, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Analysis, AnalysisResult, ResumeSummary, RoleSummary, SkillAssessment } from '@skillbridge/shared';
import { Button } from '../components/ui/Button.tsx';
import { cn } from '../lib/cn.ts';
import { dateTime } from '../lib/format.ts';
import { getAnalysis, isFinished, listAnalyses, listRoles, startAnalysis } from '../services/analyses.ts';
import { listResumes } from '../services/resumes.ts';

const POLL_MS = 2000;

/** What each evidence level means, as the analyzer scores it. */
const LEVELS = [
  { name: 'Not shown', detail: 'The resume does not show this skill.' },
  { name: 'Listed', detail: 'Only named, for example in a skills list.' },
  { name: 'Applied', detail: 'Used in a project, coursework or a competition.' },
  { name: 'Professional', detail: 'Used in a job or internship.' },
] as const;

const WEIGHTS: Record<number, string> = { 3: 'Core', 2: 'Important', 1: 'Nice to have' };

/** What to do to close a gap, by the level it should reach. */
const NEXT_STEP: Record<number, string> = {
  1: 'Mention it where you used it.',
  2: 'Use it in a project, and say what you built with it.',
  3: 'Use it in an internship or job.',
};

const levelName = (level: number) => LEVELS[level]?.name ?? String(level);

export function ReadinessPage() {
  const [params, setParams] = useSearchParams();
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [resumeId, setResumeId] = useState(params.get('resume') ?? '');
  const [roleId, setRoleId] = useState(params.get('role') ?? '');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const readable = useMemo(() => (resumes ?? []).filter((r) => r.status === 'parsed'), [resumes]);
  const role = roles.find((r) => r.id === (analysis?.roleId ?? roleId));

  // Resumes and roles, then the analysis named in the URL (a shared or reloaded link).
  useEffect(() => {
    const wanted = params.get('analysis');
    void Promise.all([listResumes(), listRoles(), wanted ? getAnalysis(wanted).catch(() => null) : null])
      .then(([resumeList, roleList, linked]) => {
        setResumes(resumeList);
        setRoles(roleList);
        const firstReadable = resumeList.find((r) => r.status === 'parsed');
        setResumeId((current) => linked?.resumeId ?? (current || firstReadable?.id || ''));
        setRoleId((current) => linked?.roleId ?? (current || roleList[0]?.id || ''));
        if (linked) setAnalysis(linked);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load your resumes'));
    // Only on first load (no dependencies): later URL changes come from this page itself.
  }, []);

  const loadHistory = useCallback((id: string) => {
    if (!id) {
      setHistory([]);
      return;
    }
    void listAnalyses(id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    loadHistory(resumeId);
  }, [resumeId, loadHistory]);

  // Poll until the worker has finished. Each new value schedules the next check.
  useEffect(() => {
    if (!analysis || isFinished(analysis)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getAnalysis(analysis.id, controller.signal)
        .then((next) => {
          setAnalysis(next);
          if (isFinished(next)) loadHistory(next.resumeId);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          setError(reason instanceof Error ? reason.message : 'Lost track of the analysis');
        });
    }, POLL_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [analysis, loadHistory]);

  function show(next: Analysis) {
    setAnalysis(next);
    setParams({ resume: next.resumeId, analysis: next.id }, { replace: true });
  }

  async function start() {
    if (!resumeId || !roleId) return;
    setBusy(true);
    setError('');
    try {
      show(await startAnalysis(resumeId, roleId));
      loadHistory(resumeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start the analysis');
    } finally {
      setBusy(false);
    }
  }

  function pickResume(id: string) {
    setResumeId(id);
    setAnalysis(null);
    setParams(id ? { resume: id } : {}, { replace: true });
  }

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Skill gap analysis</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            Readiness.
            <br />
            <em className="italic text-muted">Evidence first, then the score.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            An AI agent quotes your resume for every skill the role needs. Code checks each quote
            and computes the score, so the same resume always gets the same number.
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-6 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.6fr]">
        <aside className="space-y-6">
          <section className="border border-line bg-card p-6">
            <p className="micro">01 · Resume and role</p>
            {resumes && readable.length === 0 ? (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Upload a text-based PDF first.{' '}
                <Link to="/resume" className="underline underline-offset-4">
                  Go to resumes
                </Link>
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <Select label="Resume" value={resumeId} onChange={pickResume}>
                  {readable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fileName}
                    </option>
                  ))}
                </Select>
                <Select label="Target role" value={roleId} onChange={setRoleId}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                {roles.find((r) => r.id === roleId) && (
                  <p className="text-[11px] leading-relaxed text-muted">{roles.find((r) => r.id === roleId)!.summary}</p>
                )}
                <Button className="w-full" onClick={start} disabled={busy || !resumeId || !roleId}>
                  {busy ? 'Starting…' : 'Analyse'}
                  {!busy && <Sparkles size={14} />}
                </Button>
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section className="border border-line bg-card p-6">
              <p className="micro">Earlier analyses of this resume</p>
              <ul className="mt-3">
                {history.map((item) => (
                  <li key={item.id} className="border-t border-line first:border-t-0">
                    <button
                      type="button"
                      onClick={() => show(item)}
                      className={cn('block w-full py-3 text-left', item.id === analysis?.id && 'font-medium')}
                    >
                      <span className="block text-[13px]">
                        {roles.find((r) => r.id === item.roleId)?.name ?? item.roleId}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {dateTime(item.createdAt)} ·{' '}
                        {item.status === 'done' ? `${item.result?.score ?? '—'} / 100` : item.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <section className="min-w-0">
          {!analysis && <EmptyState />}
          {analysis && !isFinished(analysis) && <Waiting status={analysis.status} />}
          {analysis?.status === 'failed' && (
            <div className="border border-line bg-card p-6 sm:p-8">
              <p className="micro">Analysis failed</p>
              <p className="mt-3 text-sm">{analysis.error ?? 'The analysis could not be finished.'}</p>
              <Button variant="secondary" className="mt-5" onClick={start} disabled={busy}>
                <RotateCcw size={14} /> Try again
              </Button>
            </div>
          )}
          {analysis?.status === 'done' && analysis.result && <Result result={analysis.result} roleName={role?.name} />}
        </section>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="micro block">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-line bg-transparent px-3 py-3 text-sm outline-none focus:border-ink"
      >
        {children}
      </select>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-line p-6 sm:p-8">
      <p className="micro">How it works</p>
      <ol className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
        <li>
          <strong className="text-ink">1.</strong> Pick a resume and the role you want.
        </li>
        <li>
          <strong className="text-ink">2.</strong> The agent rates each skill from 0 to 3 and quotes the line that
          proves it: {LEVELS.map((l, i) => `${i} ${l.name.toLowerCase()}`).join(', ')}.
        </li>
        <li>
          <strong className="text-ink">3.</strong> Readiness = 100 × Σ weight × (level ÷ 3) ÷ Σ weight. Core
          skills count three times as much as nice-to-haves.
        </li>
      </ol>
    </div>
  );
}

function Waiting({ status }: { status: Analysis['status'] }) {
  return (
    <div className="flex items-start gap-4 border border-line bg-card p-6 sm:p-8" aria-live="polite">
      <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-muted" />
      <div>
        <p className="text-sm font-medium">{status === 'queued' ? 'Waiting for the analyzer…' : 'Reading your resume…'}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          This usually takes 10 to 30 seconds. If the AI service is busy, it retries by itself.
        </p>
      </div>
    </div>
  );
}

function Result({ result, roleName }: { result: AnalysisResult; roleName?: string }) {
  const totalWeight = result.skills.reduce((sum, s) => sum + s.weight, 0);
  const skills = [...result.skills].sort((a, b) => b.weight - a.weight || b.level - a.level);

  return (
    <div className="space-y-6">
      <div className="grid border border-line bg-card sm:grid-cols-[auto_1fr] sm:divide-x sm:divide-line">
        <div className="border-b border-line p-6 sm:border-b-0 sm:p-8">
          <p className="micro">Readiness</p>
          <p className="display mt-3 text-7xl tabular-nums">
            {result.score}
            <span className="text-2xl text-muted"> / 100</span>
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <p className="micro">{roleName ?? result.roleId}</p>
          <div className="mt-4 h-2 w-full bg-line" role="img" aria-label={`${result.score} out of 100`}>
            <div className="h-2 bg-ink" style={{ width: `${Math.min(100, result.score)}%` }} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {result.gaps.length === 0
              ? 'Every skill is at its target level.'
              : `${result.gaps.length} skill${result.gaps.length === 1 ? '' : 's'} below target. Start with the first gap: it counts the most.`}
          </p>
          <p className="mt-3 text-[10px] text-muted">
            Role v{result.roleVersion} · formula v{result.formulaVersion} · {result.model}
          </p>
        </div>
      </div>

      {result.gaps.length > 0 && (
        <section className="border border-line bg-card p-6 sm:p-8">
          <p className="micro">Gaps, most important first</p>
          <ul className="mt-4">
            {result.gaps.map((gap) => (
              <li key={gap.skillId} className="grid gap-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:gap-4">
                <div>
                  <p className="text-[13px] font-medium">
                    {gap.name} <span className="micro ml-1">{WEIGHTS[gap.weight]}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{NEXT_STEP[gap.target]}</p>
                </div>
                <p className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-muted">{levelName(gap.level)}</span>
                  <ArrowRight size={11} className="text-muted" />
                  <span className="font-medium">{levelName(gap.target)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-line bg-card p-6 sm:p-8">
        <p className="micro">Every skill, with its evidence</p>
        <ul className="mt-4">
          {skills.map((skill) => (
            <SkillRow key={skill.skillId} skill={skill} max={(100 * skill.weight) / totalWeight} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SkillRow({ skill, max }: { skill: SkillAssessment; max: number }) {
  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-medium">
          {skill.name} <span className="micro ml-1">{WEIGHTS[skill.weight]}</span>
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          {skill.points} of {Math.round(max * 10) / 10} points
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex gap-1" aria-hidden>
          {[1, 2, 3].map((step) => (
            <span key={step} className={cn('h-1.5 w-6', step <= skill.level ? 'bg-ink' : 'bg-line')} />
          ))}
        </span>
        <span className="text-[11px]" title={LEVELS[skill.level]?.detail}>
          {skill.level} · {levelName(skill.level)}
        </span>
      </div>
      {skill.evidence ? (
        <blockquote className="mt-2 border-l-2 border-line pl-3 text-xs leading-relaxed">
          <span className="font-serif text-[15px] italic">“{skill.evidence.quote}”</span>
          <span className="micro mt-1 block">
            {skill.evidence.section} · passage #{skill.evidence.passageId}
          </span>
        </blockquote>
      ) : (
        <p className="mt-2 text-[11px] text-muted">No line in the resume shows this skill.</p>
      )}
      {skill.note && <p className="mt-2 text-[11px] text-warn">{skill.note}</p>}
    </li>
  );
}
