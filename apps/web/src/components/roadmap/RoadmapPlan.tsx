import { ArrowRight, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Roadmap } from '@skillbridge/shared';
import { cn } from '../../lib/cn.ts';
import { count } from '../../lib/format.ts';
import { getRoadmap } from '../../services/analyses.ts';

const LEVEL_NAMES = ['Not shown', 'Listed', 'Applied', 'Professional'];
const WEIGHTS: Record<number, string> = { 3: 'Core', 2: 'Important', 1: 'Nice to have' };

/** Ticked steps live in this browser only: they are a reminder, not something the score uses. */
const storageKey = (analysisId: string) => `skillbridge_plan_${analysisId}`;

function loadDone(analysisId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(analysisId));
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveDone(analysisId: string, done: Set<string>) {
  try {
    localStorage.setItem(storageKey(analysisId), JSON.stringify([...done]));
  } catch {
    // Private windows can refuse storage; ticks then last until the page closes.
  }
}

export function RoadmapPlan({ analysisId }: { analysisId: string }) {
  const [plan, setPlan] = useState<Roadmap | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Set<string>>(() => loadDone(analysisId));

  useEffect(() => {
    const controller = new AbortController();
    setPlan(null);
    setError('');
    setDone(loadDone(analysisId));
    getRoadmap(analysisId, controller.signal)
      .then(setPlan)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Could not load your plan');
      });
    return () => controller.abort();
  }, [analysisId]);

  function toggle(skillId: string) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      saveDone(analysisId, next);
      return next;
    });
  }

  if (error) {
    return (
      <p role="alert" className="border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
        {error}
      </p>
    );
  }
  if (!plan || plan.steps.length === 0) return null;

  const hoursLeft = plan.steps.filter((s) => !done.has(s.skillId)).reduce((sum, s) => sum + s.hours, 0);

  return (
    <section className="border border-line bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="micro">Your plan</p>
          <h2 className="mt-2 font-serif text-2xl">Close the gaps, in this order</h2>
        </div>
        <p className="text-[11px] tabular-nums text-muted">
          {hoursLeft} of {plan.totalHours} hours left · about {count(Math.ceil(hoursLeft / plan.hoursPerWeek), 'week')} at{' '}
          {plan.hoursPerWeek} h a week
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Foundations come before what builds on them. Every link is from a checked list of free
        resources (last checked {plan.catalogueCheckedAt}). Tick a step when its evidence is on your
        resume, then run a new readiness check to see the score move.
      </p>

      <ol className="mt-5">
        {plan.steps.map((step, index) => {
          const isDone = done.has(step.skillId);
          return (
            <li key={step.skillId} className="grid grid-cols-[1.75rem_1fr] gap-3 border-t border-line py-5 first:border-t-0">
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => toggle(step.skillId)}
                aria-label={`Mark ${step.name} as done`}
                className="mt-1 h-4 w-4 accent-[var(--ink)]"
              />
              <div className={cn('min-w-0', isDone && 'opacity-50')}>
                <p className="text-[13px] font-medium">
                  <span className="micro mr-2">{String(index + 1).padStart(2, '0')}</span>
                  {step.name} <span className="micro ml-1">{WEIGHTS[step.weight]}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {LEVEL_NAMES[step.from]} <ArrowRight size={11} /> <span className="text-ink">{LEVEL_NAMES[step.to]}</span> · about{' '}
                  {step.hours} h
                  {step.prerequisites.length > 0 && (
                    <> · after {step.prerequisites.map((id) => plan.steps.find((s) => s.skillId === id)?.name ?? id).join(', ')}</>
                  )}
                </p>
                <p className="mt-2 text-xs leading-relaxed">{step.objective}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  <strong className="font-medium text-ink">Do:</strong> {step.activity}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  <strong className="font-medium text-ink">Done when:</strong> {step.doneWhen}
                </p>
                <ul className="mt-2 space-y-1">
                  {step.resources.map((r) => (
                    <li key={r.id} className="text-[11px]">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                        {r.title} <ExternalLink size={10} />
                      </a>{' '}
                      <span className="text-muted">
                        · {r.provider} · {r.kind} · ~{r.hours} h
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
