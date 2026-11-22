import { ArrowRight, Check, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.tsx';
import { dateTime } from '../lib/format.ts';
import {
  LANGUAGE_LABEL,
  LEVEL_LABEL,
  STAGE_LABEL,
  listInterviews,
  type InterviewListItem,
} from '../services/interviews.ts';

const isAbort = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError';

export function InterviewsPage() {
  const [items, setItems] = useState<InterviewListItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const more = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listInterviews(null, controller.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.next_cursor);
      })
      .catch((reason: unknown) => {
        if (isAbort(reason)) return;
        setItems([]);
        setError(reason instanceof Error ? reason.message : 'Could not load your interviews');
      });
    return () => {
      controller.abort();
      more.current?.abort();
    };
  }, []);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    more.current = controller;
    setLoadingMore(true);
    setError('');
    try {
      const page = await listInterviews(cursor, controller.signal);
      // The cursor is a position, so a page never repeats rows; the filter only guards a double click.
      setItems((current) => {
        const seen = new Set((current ?? []).map((item) => item.id));
        return [...(current ?? []), ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.next_cursor);
    } catch (reason) {
      if (isAbort(reason)) return;
      setError(reason instanceof Error ? reason.message : 'Could not load more interviews');
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Mock interviews</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            Interviews.
            <br />
            <em className="italic text-muted">Practise, then review.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            An AI interviewer asks one question at a time and grades each answer out of 10. When you
            finish, it writes a report on what went well and what to work on.
          </p>
        </div>
        <Link
          to="/interviews/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap border border-ink bg-ink px-5 py-3 text-[13px] font-medium text-paper hover:opacity-90"
        >
          <Plus size={14} /> New interview
        </Link>
      </header>

      {error && (
        <p role="alert" className="mb-6 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="micro">Loading interviews…</p>
      ) : items.length === 0 ? (
        !error && <EmptyState />
      ) : (
        <section className="border border-line bg-card p-6 sm:p-8">
          <p className="micro">Your interviews, newest first</p>
          <ul className="mt-4">
            {items.map((item) => (
              <li key={item.id} className="border-t border-line first:border-t-0">
                <Link
                  to={`/interviews/${item.id}`}
                  className="group grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {LANGUAGE_LABEL[item.programming_language]}
                      <span className="micro ml-2">{LEVEL_LABEL[item.candidate_level]}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">{dateTime(item.created_at)}</p>
                  </div>
                  <p className="flex items-center gap-3 text-[11px]">
                    {item.status === 'finished' ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Check size={12} /> Finished
                      </span>
                    ) : (
                      <span className="text-muted">In progress · {STAGE_LABEL[item.stage]}</span>
                    )}
                    <ArrowRight size={12} className="text-muted transition-colors group-hover:text-ink" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {cursor && (
            <Button variant="secondary" className="mt-4 w-full sm:w-auto" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-line p-6 sm:p-8">
      <p className="micro">No interviews yet</p>
      <ol className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
        <li>
          <strong className="text-ink">1.</strong> Pick a language, your level and the kind of interviewer you want.
        </li>
        <li>
          <strong className="text-ink">2.</strong> Add your resume, a job description or the skill gaps from your
          readiness check, so the questions are about you.
        </li>
        <li>
          <strong className="text-ink">3.</strong> Answer in writing. Finish when you are ready and read the report.
        </li>
      </ol>
      <Link to="/interviews/new" className="mt-5 inline-flex items-center gap-1 text-xs underline underline-offset-4">
        Start your first interview <ArrowRight size={12} />
      </Link>
    </div>
  );
}
