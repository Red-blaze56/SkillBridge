import { ArrowLeft, Flag, Loader2, RotateCcw, Send } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api.ts';
import { Button } from '../components/ui/Button.tsx';
import { cn } from '../lib/cn.ts';
import { dateTime } from '../lib/format.ts';
import {
  LANGUAGE_LABEL,
  LEVEL_LABEL,
  STAGES,
  STAGE_LABEL,
  answerInterview,
  finishInterview,
  getInterview,
  score,
  topicLabel,
  type Evaluation,
  type Interview,
  type InterviewMessage,
  type InterviewReport,
} from '../services/interviews.ts';

const isAbort = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError';
const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);
const candidateCount = (interview: Interview) => interview.messages.filter((m) => m.sender === 'candidate').length;

/**
 * Errors after which the answer may still have been saved: a dropped connection, or the API
 * giving up (502/503/504) while the interview service was still grading it.
 */
const mayHaveArrived = (reason: unknown) => !(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500;
const RECHECK_EVERY_MS = 3000;
const RECHECK_FOR_MS = 30_000;

/** Waits `ms`, or less if `signal` aborts. Never leaves a timer behind. */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const SEND_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

/** idle: waiting for the student. answering: an answer is being graded. finishing: the report is being written. */
type Phase = 'idle' | 'answering' | 'finishing';

export function InterviewPage() {
  const { id = '' } = useParams();
  // A new id is a new interview: start from scratch rather than carry state over.
  return <InterviewRoom key={id} id={id} />;
}

function InterviewRoom({ id }: { id: string }) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rechecking, setRechecking] = useState(false);
  // The service grades each answer but doesn't store the grade, so it lives here, keyed by message id.
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});

  const busy = useRef(false); // set synchronously, so a double press can't send twice
  const acted = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Aborted when the page goes away: later results are ignored and any re-check stops.
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const alive = () => lifetime.current?.signal.aborted === false;

  useEffect(() => {
    // Coming from the long setup form, the page would otherwise open halfway down.
    window.scrollTo({ top: 0 });
    const controller = new AbortController();
    getInterview(id, controller.signal)
      .then(setInterview)
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setLoadError(message(reason, 'Could not open this interview'));
      });
    return () => controller.abort();
  }, [id]);

  const finished = interview?.status === 'finished';
  const messageCount = interview?.messages.length ?? 0;

  // After the student acts, keep the newest message and the answer box in view.
  useEffect(() => {
    if (acted.current && !finished) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messageCount, pending, finished, phase]);

  // When the interview ends, the report replaces the conversation at the top of the page.
  useEffect(() => {
    if (acted.current && finished) window.scrollTo({ top: 0 });
  }, [finished]);

  useEffect(() => {
    if (acted.current && phase === 'idle') composer.current?.focus({ preventScroll: true });
  }, [phase]);

  async function writeReport(interviewId: string) {
    setPhase('finishing');
    setError('');
    try {
      const done = await finishInterview(interviewId);
      if (alive()) setInterview(done);
    } catch (reason) {
      if (alive()) setError(message(reason, 'Could not write the report'));
    }
  }

  /** Looks for an answer the service saved after the request failed. The interview with it, or null. */
  async function findSavedAnswer(before: Interview): Promise<Interview | null> {
    const signal = lifetime.current?.signal;
    if (!signal) return null;
    const until = Date.now() + RECHECK_FOR_MS;
    while (!signal.aborted && Date.now() < until) {
      const fresh = await getInterview(before.id, signal).catch(() => null);
      if (fresh && candidateCount(fresh) > candidateCount(before)) return fresh;
      await sleep(RECHECK_EVERY_MS, signal);
    }
    return null;
  }

  async function send() {
    const content = draft.trim();
    if (!interview || interview.status !== 'active' || busy.current || !content) return;
    busy.current = true;
    acted.current = true;
    setPhase('answering');
    setPending(content);
    setDraft('');
    setError('');
    try {
      const result = await answerInterview(interview.id, content);
      if (!alive()) return;
      const answered = result.interview.messages.findLast((m) => m.sender === 'candidate');
      const { evaluation } = result;
      if (answered && evaluation) setEvaluations((current) => ({ ...current, [answered.id]: evaluation }));
      setInterview(result.interview);
      setPending(null);
      // The service ends the interview itself and usually writes the report too.
      if (result.should_finish && !result.interview.report) await writeReport(result.interview.id);
    } catch (reason) {
      if (!alive()) return;
      // The service can still save an answer after the request failed. Look for it for a while
      // before handing the answer back, so the student doesn't send it twice.
      setError(message(reason, 'Your answer could not be sent'));
      let saved: Interview | null = null;
      if (mayHaveArrived(reason)) {
        setRechecking(true);
        saved = await findSavedAnswer(interview);
        if (!alive()) return;
        setRechecking(false);
      }
      setPending(null);
      if (saved) {
        setError('');
        setInterview(saved);
        if (saved.status === 'finished' && !saved.report) await writeReport(saved.id);
      } else {
        setDraft(content);
      }
    } finally {
      busy.current = false;
      if (alive()) setPhase('idle');
    }
  }

  async function finish(ask: boolean) {
    if (!interview || busy.current) return;
    if (
      ask &&
      !window.confirm('Finish this interview? You can’t answer more questions, and the report covers what you’ve answered so far.')
    ) {
      return;
    }
    busy.current = true;
    acted.current = true;
    await writeReport(interview.id);
    busy.current = false;
    if (alive()) setPhase('idle');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  if (!interview) {
    return (
      <div>
        {loadError ? (
          <>
            <p role="alert" className="mb-6 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
              {loadError}
            </p>
            <Link to="/interviews" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs underline underline-offset-4">
              <ArrowLeft size={12} /> All interviews
            </Link>
          </>
        ) : (
          <p className="micro">Opening the interview…</p>
        )}
      </div>
    );
  }

  const topic = topicLabel(interview.current_topic);
  const covered = (interview.covered_topics ?? []).map(topicLabel).filter((t): t is string => t !== null);
  const stageIndex = STAGES.indexOf(interview.stage);

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">
            Mock interview · {LEVEL_LABEL[interview.candidate_level]} · {dateTime(interview.created_at)}
          </p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            {LANGUAGE_LABEL[interview.programming_language]} interview.
            <br />
            <em className="italic text-muted">{finished ? 'Here is how it went.' : 'One question at a time.'}</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            {finished
              ? 'The report comes first. The full conversation is below it.'
              : 'Answer as you would out loud. The interviewer digs deeper when you hold up, and moves on when a topic is done.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link to="/interviews" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs underline underline-offset-4">
            <ArrowLeft size={12} /> All interviews
          </Link>
          {!finished && (
            <Button variant="secondary" onClick={() => void finish(true)} disabled={phase !== 'idle'}>
              <Flag size={14} /> Finish interview
            </Button>
          )}
        </div>
      </header>

      {finished && (
        <div className="mb-6">
          {interview.report ? (
            <Report report={interview.report} />
          ) : phase === 'finishing' ? (
            <Working text="Writing your report…" />
          ) : (
            <div className="border border-line bg-card p-6 sm:p-8">
              <p className="micro">Report</p>
              <p className="mt-3 text-sm">The report for this interview hasn&rsquo;t been written yet.</p>
              {error && (
                <p role="alert" className="mt-4 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
                  {error}
                </p>
              )}
              <Button variant="secondary" className="mt-5" onClick={() => void finish(false)}>
                <RotateCcw size={14} /> Write the report
              </Button>
            </div>
          )}
        </div>
      )}

      {!finished && (
        <section className="mb-6 grid border border-line bg-card sm:grid-cols-2 sm:divide-x sm:divide-line">
          <div className="border-b border-line p-6 sm:border-b-0">
            <p className="micro">Stage</p>
            <p className="mt-2 font-serif text-2xl">{STAGE_LABEL[interview.stage]}</p>
            <ol className="mt-3 flex gap-1">
              {STAGES.map((stage, index) => (
                <li
                  key={stage}
                  title={STAGE_LABEL[stage]}
                  className={cn('h-1.5 flex-1', index <= stageIndex ? 'bg-ink' : 'bg-line')}
                >
                  <span className="sr-only">
                    {STAGE_LABEL[stage]}
                    {index === stageIndex ? ' (now)' : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 p-6">
            <p className="micro">Topic</p>
            <p className="mt-2 font-serif text-2xl wrap-anywhere">{topic ?? 'Getting started'}</p>
            {covered.length > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted wrap-anywhere">Covered: {covered.join(' · ')}</p>
            )}
          </div>
        </section>
      )}

      <section className="border border-line bg-card p-6 sm:p-8">
        <p className="micro">{finished ? 'Transcript' : 'Conversation'}</p>
        <ol className="mt-2">
          {interview.messages.map((m) => (
            <MessageRow key={m.id} message={m} evaluation={evaluations[m.id]} />
          ))}
          {pending !== null && (
            <li className="border-t border-line py-5">
              <p className="micro">You</p>
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-ink pl-4 text-sm leading-relaxed wrap-anywhere">
                {pending}
              </p>
              <p className="mt-3 flex items-start gap-2 pl-4 text-[11px] leading-relaxed text-muted" aria-live="polite">
                <Loader2 size={13} className="mt-px shrink-0 animate-spin" />
                {rechecking
                  ? 'Checking whether your answer reached the interviewer anyway…'
                  : 'The interviewer is reading your answer and thinking of the next question. This can take up to a minute.'}
              </p>
            </li>
          )}
          {!finished && phase === 'finishing' && (
            <li className="border-t border-line py-5">
              <Working text="Writing your report…" />
            </li>
          )}
        </ol>

        {!finished && (
          <div className="mt-2 border-t border-line pt-6">
            {error && (
              <p role="alert" className="mb-4 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
                {error}
              </p>
            )}
            <label htmlFor="answer" className="micro block">
              Your answer
            </label>
            <textarea
              id="answer"
              ref={composer}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              disabled={phase !== 'idle'}
              rows={5}
              placeholder={phase === 'idle' ? 'Type your answer…' : ''}
              className="mt-2 block w-full resize-y border border-line bg-transparent px-3 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted focus:border-ink disabled:opacity-60"
            />
            <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted">
                {phase === 'answering' ? 'Waiting for the interviewer…' : `${SEND_KEY} + Enter to send`}
              </p>
              <Button onClick={() => void send()} disabled={phase !== 'idle' || !draft.trim()}>
                {phase === 'answering' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Thinking…
                  </>
                ) : (
                  <>
                    Send answer <Send size={14} />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        <div ref={bottom} />
      </section>
    </div>
  );
}

function MessageRow({ message, evaluation }: { message: InterviewMessage; evaluation?: Evaluation }) {
  if (message.sender === 'interviewer') {
    return (
      <li className="border-t border-line py-5 first:border-t-0">
        <p className="micro">Interviewer</p>
        <p className="mt-2 whitespace-pre-wrap font-serif text-[19px] leading-snug wrap-anywhere">{message.content}</p>
      </li>
    );
  }
  return (
    <li className="border-t border-line py-5 first:border-t-0">
      <p className="micro">You</p>
      <p className="mt-2 whitespace-pre-wrap border-l-2 border-ink pl-4 text-sm leading-relaxed wrap-anywhere">
        {message.content}
      </p>
      {evaluation && (
        <p className="mt-3 pl-4 text-[11px] leading-relaxed text-muted">
          <span className="font-medium tabular-nums text-ink">{score(evaluation.score)} / 10</span>
          {evaluation.feedback && <> · {evaluation.feedback}</>}
        </p>
      )}
    </li>
  );
}

function Working({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4 border border-line bg-card p-6 sm:p-8" aria-live="polite">
      <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-muted" />
      <div>
        <p className="text-sm font-medium">{text}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">This can take up to a minute.</p>
      </div>
    </div>
  );
}

function Report({ report }: { report: InterviewReport }) {
  const percent = Math.max(0, Math.min(100, report.overall_score * 10));
  return (
    <div className="space-y-6">
      <div className="grid border border-line bg-card sm:grid-cols-[auto_1fr] sm:divide-x sm:divide-line">
        <div className="border-b border-line p-6 sm:border-b-0 sm:p-8">
          <p className="micro">Overall</p>
          <p className="display mt-3 text-7xl tabular-nums">
            {score(report.overall_score)}
            <span className="text-2xl text-muted"> / 10</span>
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <p className="micro">Summary</p>
          <div className="mt-4 h-2 w-full bg-line" role="img" aria-label={`${score(report.overall_score)} out of 10`}>
            <div className="h-2 bg-ink" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-4 text-sm leading-relaxed">{report.summary || 'No summary was written for this interview.'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ReportList label="What went well" title="Strengths" items={report.strengths} />
        <ReportList label="What to work on" title="Weaknesses" items={report.weaknesses} />
        <ReportList label="What to do next" title="Suggestions" items={report.suggestions} />
      </div>
    </div>
  );
}

function ReportList({ label, title, items }: { label: string; title: string; items: string[] }) {
  return (
    <section className="border border-line bg-card p-6">
      <p className="micro">{label}</p>
      <h2 className="mt-2 font-serif text-2xl">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-muted">None noted.</p>
      ) : (
        <ul className="mt-4">
          {items.map((item, index) => (
            <li key={index} className="border-t border-line py-3 text-[13px] leading-relaxed first:border-t-0">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
