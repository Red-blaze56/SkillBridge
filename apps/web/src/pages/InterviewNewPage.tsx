import { ArrowLeft, ArrowRight, Check, Gauge, Loader2, Plus, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Analysis, RoleSummary } from '@skillbridge/shared';
import { Button } from '../components/ui/Button.tsx';
import { cn } from '../lib/cn.ts';
import { count, shortDate } from '../lib/format.ts';
import { listRoles } from '../services/analyses.ts';
import {
  LANGUAGES,
  LANGUAGE_LABEL,
  LEVELS,
  LEVEL_LABEL,
  MAX_JD_CHARS,
  MAX_PDF_BYTES,
  MAX_TOPICS,
  MAX_TOPIC_CHARS,
  PERSONALITIES,
  PERSONALITY,
  latestDoneAnalysis,
  mergeTopics,
  parseResume,
  startInterview,
  type CandidateLevel,
  type CorrectionMode,
  type PersonalityType,
  type ProgrammingLanguage,
} from '../services/interviews.ts';

const isAbort = (reason: unknown) => reason instanceof DOMException && reason.name === 'AbortError';
const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

type ResumeState =
  | { kind: 'none' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'read'; fileName: string; text: string }
  | { kind: 'unreadable'; fileName: string };

/** What the readiness check offers: still loading, nothing usable, or the newest finished analysis. */
type GapsState = { kind: 'loading' } | { kind: 'none' } | { kind: 'ready'; analysis: Analysis; roleName: string };

const MODES: { id: CorrectionMode; name: string; detail: string }[] = [
  { id: 'guided', name: 'Guided', detail: 'When an answer is wrong, the interviewer explains and asks again.' },
  { id: 'strict', name: 'Strict', detail: 'When an answer is wrong, the interviewer moves on.' },
];

export function InterviewNewPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const parsing = useRef<AbortController | null>(null);

  const [language, setLanguage] = useState<ProgrammingLanguage>('python');
  const [level, setLevel] = useState<CandidateLevel>('fresher');
  const [personality, setPersonality] = useState<PersonalityType>('warm');
  const [mode, setMode] = useState<CorrectionMode>('guided');
  const [resume, setResume] = useState<ResumeState>({ kind: 'none' });
  const [resumeError, setResumeError] = useState('');
  const [jd, setJd] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [gaps, setGaps] = useState<GapsState>({ kind: 'loading' });
  const [gapsAdded, setGapsAdded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // The newest finished readiness check, so its gaps can become the interview's topics.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([latestDoneAnalysis(controller.signal), listRoles().catch((): RoleSummary[] => [])])
      .then(([analysis, roles]) => {
        if (controller.signal.aborted) return;
        if (!analysis) {
          setGaps({ kind: 'none' });
          return;
        }
        const roleName = roles.find((r) => r.id === analysis.roleId)?.name ?? analysis.roleId;
        setGaps({ kind: 'ready', analysis, roleName });
      })
      .catch((reason: unknown) => {
        if (!isAbort(reason)) setGaps({ kind: 'none' });
      });
    return () => {
      controller.abort();
      parsing.current?.abort();
    };
  }, []);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be picked again
    if (!file) return;
    setResumeError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setResumeError('Please choose a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setResumeError('Please upload a PDF under 10 MB.');
      return;
    }

    parsing.current?.abort();
    const controller = new AbortController();
    parsing.current = controller;
    setResume({ kind: 'reading', fileName: file.name });
    try {
      const parsed = await parseResume(file, controller.signal);
      if (!parsed.readable) {
        setResume({ kind: 'unreadable', fileName: file.name });
        return;
      }
      setResume({ kind: 'read', fileName: file.name, text: parsed.resume_text });
      setTopics((current) => mergeTopics(current, parsed.focus_topics));
    } catch (reason) {
      if (isAbort(reason)) return;
      setResume({ kind: 'none' });
      setResumeError(message(reason, 'Could not read this PDF.'));
    }
  }

  function removeResume() {
    parsing.current?.abort();
    setResume({ kind: 'none' });
    setResumeError('');
  }

  function applyGaps() {
    if (gaps.kind !== 'ready') return;
    const names = (gaps.analysis.result?.gaps ?? []).map((gap) => gap.name);
    setTopics((current) => mergeTopics(names, current));
    setGapsAdded(true);
  }

  function addTopic(event: FormEvent) {
    event.preventDefault();
    setTopics((current) => mergeTopics(current, [newTopic]));
    setNewTopic('');
  }

  async function start() {
    if (starting || resume.kind === 'reading') return;
    setStarting(true);
    setError('');
    try {
      const interview = await startInterview({
        programming_language: language,
        candidate_level: level,
        personality_type: personality,
        correction_mode: mode,
        resume_text: resume.kind === 'read' && resume.text ? resume.text : undefined,
        jd_text: jd.trim() || undefined,
        focus_topics: topics.length > 0 ? topics : undefined,
      });
      navigate(`/interviews/${interview.id}`);
    } catch (reason) {
      setError(message(reason, 'Could not start the interview'));
      setStarting(false);
    }
  }

  const gapCount = gaps.kind === 'ready' ? (gaps.analysis.result?.gaps.length ?? 0) : 0;
  const full = topics.length >= MAX_TOPICS;

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Mock interview · setup</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            New interview.
            <br />
            <em className="italic text-muted">Tell the interviewer about you.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            Pick a language and your level. Add your resume, a job description or your skill gaps, and the
            questions will follow them.
          </p>
        </div>
        <Link to="/interviews" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs underline underline-offset-4">
          <ArrowLeft size={12} /> All interviews
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <div className="min-w-0 space-y-6">
          <section className="border border-line bg-card p-6 sm:p-8">
            <p className="micro">01 · The basics</p>
            <h2 className="mt-2 font-serif text-2xl">Language and level</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Select label="Language" value={language} onChange={(v) => setLanguage(v as ProgrammingLanguage)}>
                {LANGUAGES.map((id) => (
                  <option key={id} value={id}>
                    {LANGUAGE_LABEL[id]}
                  </option>
                ))}
              </Select>
              <Select label="Your level" value={level} onChange={(v) => setLevel(v as CandidateLevel)}>
                {LEVELS.map((id) => (
                  <option key={id} value={id}>
                    {LEVEL_LABEL[id]}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className="mt-8">
              <legend className="micro">Interviewer</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {PERSONALITIES.map((id) => (
                  <Choice
                    key={id}
                    name="personality"
                    checked={personality === id}
                    onChange={() => setPersonality(id)}
                    title={PERSONALITY[id].name}
                    detail={PERSONALITY[id].detail}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-8">
              <legend className="micro">Wrong answers</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MODES.map((m) => (
                  <Choice
                    key={m.id}
                    name="mode"
                    checked={mode === m.id}
                    onChange={() => setMode(m.id)}
                    title={m.name}
                    detail={m.detail}
                  />
                ))}
              </div>
            </fieldset>
          </section>

          <section className="border border-line bg-card p-6 sm:p-8">
            <p className="micro">02 · Optional</p>
            <h2 className="mt-2 font-serif text-2xl">What to ask about</h2>
            <p className="mt-1 text-xs text-muted">
              Leave this empty for a general interview in {LANGUAGE_LABEL[language]}.
            </p>

            <div className="mt-6">
              <p className="micro">Resume</p>
              {resume.kind === 'none' ? (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="mt-2 flex w-full flex-col items-center justify-center gap-2 border border-dashed border-line px-6 py-8 text-center transition-colors hover:border-ink"
                >
                  <Upload size={20} className="text-muted" />
                  <span className="text-sm font-medium">Choose a PDF resume</span>
                  <span className="text-[11px] text-muted">PDF only · max 10 MB · topics are picked from it</span>
                </button>
              ) : (
                <div className="mt-2 flex items-start justify-between gap-4 border border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{resume.fileName}</p>
                    {resume.kind === 'reading' && (
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-muted" aria-live="polite">
                        <Loader2 size={12} className="animate-spin" /> Reading your resume and picking topics…
                      </p>
                    )}
                    {resume.kind === 'read' && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ok">
                        <Check size={12} /> Read. Its topics are added below.
                      </p>
                    )}
                    {resume.kind === 'unreadable' && (
                      <p className="mt-0.5 text-[11px] text-warn">
                        This PDF&rsquo;s text couldn&rsquo;t be read. Try a text-based PDF, or start without it.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={removeResume}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted hover:text-ink"
                  >
                    <X size={12} /> {resume.kind === 'reading' ? 'Cancel' : 'Remove'}
                  </button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,application/pdf"
                onChange={onFile}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
              {resumeError && (
                <p role="alert" className="mt-3 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
                  {resumeError}
                </p>
              )}
            </div>

            <div className="mt-8">
              <div className="flex items-baseline justify-between gap-4">
                <p className="micro">Focus topics</p>
                <p className="text-[11px] tabular-nums text-muted">
                  {topics.length} / {MAX_TOPICS}
                </p>
              </div>
              {topics.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  None yet. They come from your resume or your skill gaps, or add your own.
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <li
                      key={topic}
                      className="inline-flex max-w-full items-center gap-1.5 border border-line bg-paper py-1 pl-2.5 pr-1 text-[12px]"
                    >
                      <span className="min-w-0 wrap-anywhere">{topic}</span>
                      <button
                        type="button"
                        onClick={() => setTopics((current) => current.filter((t) => t !== topic))}
                        className="grid h-6 w-6 shrink-0 place-items-center text-muted hover:text-ink"
                        aria-label={`Remove ${topic}`}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addTopic} className="mt-3 flex gap-2">
                <label htmlFor="new-topic" className="sr-only">
                  Add a topic
                </label>
                <input
                  id="new-topic"
                  value={newTopic}
                  onChange={(event) => setNewTopic(event.target.value)}
                  maxLength={MAX_TOPIC_CHARS}
                  disabled={full}
                  placeholder={full ? 'The list is full' : 'Add a topic, e.g. REST APIs'}
                  className="min-w-0 flex-1 border border-line bg-transparent px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-ink disabled:opacity-60"
                />
                <Button type="submit" variant="secondary" className="min-h-0 px-4 py-2.5" disabled={full || !newTopic.trim()}>
                  <Plus size={14} /> Add
                </Button>
              </form>
            </div>

            <div className="mt-8 space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="jd" className="micro block">
                  Job description
                </label>
                <p className="text-[11px] tabular-nums text-muted">
                  {jd.length.toLocaleString('en-GB')} / {MAX_JD_CHARS.toLocaleString('en-GB')}
                </p>
              </div>
              <textarea
                id="jd"
                value={jd}
                onChange={(event) => setJd(event.target.value)}
                maxLength={MAX_JD_CHARS}
                rows={6}
                placeholder="Paste the job ad, if you are practising for one."
                className="block w-full resize-y border border-line bg-transparent px-3 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted focus:border-ink"
              />
            </div>
          </section>

          {error && (
            <p role="alert" className="border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={start} disabled={starting || resume.kind === 'reading'}>
              {starting ? 'Starting…' : 'Start interview'}
              {!starting && <ArrowRight size={14} />}
            </Button>
            <p className="text-[11px] text-muted">
              {resume.kind === 'reading'
                ? 'Waiting for your resume to be read.'
                : 'There is a daily limit on new interviews.'}
            </p>
          </div>
        </div>

        <aside className="order-first space-y-6 lg:order-none">
          <section className="border border-line bg-card p-6">
            <p className="micro">From your readiness check</p>
            <h2 className="mt-2 font-serif text-2xl">Use my skill gaps</h2>
            {gaps.kind === 'loading' && <p className="mt-4 text-xs text-muted">Looking for your latest check…</p>}
            {gaps.kind === 'none' && (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Check your resume against a role first, and its gaps can become the interview&rsquo;s topics.{' '}
                <Link to="/readiness" className="underline underline-offset-4">
                  Check readiness
                </Link>
              </p>
            )}
            {gaps.kind === 'ready' && gapCount === 0 && (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Your {gaps.roleName} check from {shortDate(gaps.analysis.createdAt)} found no gaps.
              </p>
            )}
            {gaps.kind === 'ready' && gapCount > 0 && (
              <>
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  Your {gaps.roleName} check from {shortDate(gaps.analysis.createdAt)} found{' '}
                  {count(gapCount, 'gap')}. Practise them here, most important first
                  {gapCount > MAX_TOPICS ? ` (the first ${MAX_TOPICS})` : ''}.
                </p>
                <ul className="mt-4">
                  {(gaps.analysis.result?.gaps ?? []).slice(0, MAX_TOPICS).map((gap) => (
                    <li key={gap.skillId} className="border-t border-line py-2 text-[13px] first:border-t-0">
                      {gap.name}
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" className="mt-4 w-full" onClick={applyGaps}>
                  {gapsAdded ? <Check size={14} /> : <Gauge size={14} />}
                  {gapsAdded ? 'Added to the topics' : 'Use my skill gaps'}
                </Button>
              </>
            )}
          </section>

          <section className="border border-dashed border-line p-6">
            <p className="micro">How it goes</p>
            <ol className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
              <li>
                <strong className="text-ink">1.</strong> The interviewer asks one question at a time and digs deeper
                when you hold up.
              </li>
              <li>
                <strong className="text-ink">2.</strong> Each answer gets a score out of 10 and a line of feedback.
              </li>
              <li>
                <strong className="text-ink">3.</strong> Finish when you like. The report lists strengths, weaknesses
                and what to do next.
              </li>
            </ol>
          </section>
        </aside>
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

/** A radio button drawn as a square card with a title and one line of detail. */
function Choice({
  name,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={cn(
        'block cursor-pointer border px-3 py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
        checked ? 'border-ink' : 'border-line hover:border-muted',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium">
        {title}
        {checked && <Check size={13} />}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{detail}</span>
    </label>
  );
}
