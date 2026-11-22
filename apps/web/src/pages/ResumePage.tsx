import { ArrowRight, Check, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ResumeDetail, ResumeSummary } from '@skillbridge/shared';
import { Button } from '../components/ui/Button.tsx';
import {
  MAX_RESUME_BYTES,
  deleteResume,
  getResume,
  listResumes,
  uploadResume,
} from '../services/resumes.ts';
import { count, shortDate } from '../lib/format.ts';

/** Why the parser set a line aside, in words a student understands. */
const HIDDEN_REASON: Record<ResumeDetail['hidden'][number]['reason'], string> = {
  invisible: 'invisible text',
  transparent: 'see-through text',
  'too-small': 'text too small to read',
  'off-page': 'text placed outside the page',
  'blends-into-background': 'text the same colour as the background',
};

export function ResumePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [selected, setSelected] = useState<ResumeDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const items = await listResumes();
    setResumes(items);
    return items;
  }

  useEffect(() => {
    void refresh().catch((reason) =>
      setError(reason instanceof Error ? reason.message : 'Could not load resumes'),
    );
  }, []);

  async function openResume(id: string) {
    setError('');
    try {
      setSelected(await getResume(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open resume');
    }
  }

  async function upload() {
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      setError('The PDF is larger than 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const detail = await uploadResume(file);
      setSelected(detail);
      await refresh();
      setFile(null);
      if (inputRef.current) inputRef.current.value = ''; // so the same file can be picked again
      setMessage(detail.status === 'parsed' ? 'Resume uploaded and parsed.' : 'Uploaded, but its text could not be read.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Resume upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(resume: ResumeSummary) {
    if (!window.confirm(`Delete ${resume.fileName}? Its analyses are deleted too.`)) return;
    const { id } = resume;
    setBusy(true);
    setError('');
    try {
      await deleteResume(id);
      setSelected((value) => (value?.id === id ? null : value));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete resume');
    } finally {
      setBusy(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
    setMessage('');
  }

  return (
    <div>
      <header className="mb-10 flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="micro">Assessment setup</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">
            Resume evidence.
            <br />
            <em className="italic text-muted">Two inputs, one score.</em>
          </h1>
          <p className="measure mt-4 text-sm leading-relaxed text-muted">
            Upload a text-based PDF and inspect the evidence extracted from its pages.
          </p>
        </div>
        <span className="micro border border-line px-2.5 py-1">PDF · 5 MB max</span>
      </header>

      {error && (
        <p role="alert" className="mb-6 border border-bad/40 bg-bad/5 px-4 py-3 text-xs text-bad">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <section className="border border-line bg-card p-6 sm:p-8">
          <p className="micro">01 · Resume</p>
          <h2 className="mt-2 font-serif text-2xl">Upload your resume</h2>
          <p className="mt-1 text-xs text-muted">
            A text-based PDF, maximum 5 MB. Scanned image PDFs cannot be read.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-6 flex w-full flex-col items-center justify-center gap-2 border border-dashed border-line px-6 py-10 text-center transition-colors hover:border-ink"
          >
            <Upload size={22} className="text-muted" />
            <span className="text-sm font-medium">{file?.name ?? 'Choose a PDF resume'}</span>
            <span className="text-[11px] text-muted">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB selected` : 'PDF only · max 5 MB'}
            </span>
            <span className="mt-1 text-[11px] underline underline-offset-4">Browse files</span>
          </button>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={onFile} className="sr-only" />

          {message && (
            <p className="mt-4 border border-ok/40 bg-ok/5 px-3 py-2 text-xs text-ok">{message}</p>
          )}

          <Button className="mt-5" onClick={upload} disabled={!file || busy}>
            {busy ? 'Processing…' : 'Upload resume'}
            {!busy && <Upload size={14} />}
          </Button>

          {selected && (
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="micro">Extracted evidence</p>
                {selected.status === 'parsed' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ok">
                    <Check size={12} /> Parsed
                  </span>
                ) : (
                  <span className="text-[11px] text-warn">Unreadable</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{selected.fileName}</p>
                {selected.status === 'parsed' && (
                  <Link
                    to={`/readiness?resume=${selected.id}`}
                    className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
                  >
                    Check readiness <ArrowRight size={12} />
                  </Link>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {count(selected.pageCount, 'page')} · {count(selected.passageCount, 'passage')} ·{' '}
                {count(selected.hiddenCount, 'hidden line')}
              </p>

              {selected.quality.problems.length > 0 && (
                <div className="mt-4 border border-warn/40 px-3 py-2 text-xs text-warn">
                  {selected.quality.problems.join(' · ')}
                </div>
              )}

              {selected.hidden.length > 0 && (
                <div className="mt-4 border border-bad/40 bg-bad/5 px-3 py-2 text-xs">
                  <p className="font-medium text-bad">
                    {selected.hidden.length} hidden {selected.hidden.length === 1 ? 'line was' : 'lines were'} left
                    out of the analysis
                  </p>
                  <ul className="mt-2 space-y-1">
                    {selected.hidden.slice(0, 5).map((item, index) => (
                      <li key={index} className="text-muted">
                        Page {item.page}, {HIDDEN_REASON[item.reason]}: “{item.preview}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {selected.passages.slice(0, 20).map((passage) => (
                  <li key={passage.id} className="border-t border-line py-3 first:border-t-0">
                    <p className="micro">{passage.section} · page {passage.page}</p>
                    <p className="mt-1 text-xs leading-relaxed">{passage.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="border border-line bg-card p-6">
          <p className="micro">Saved resumes</p>
          {resumes.length === 0 ? (
            <p className="mt-5 text-xs text-muted">No resume uploaded yet.</p>
          ) : (
            <ul className="mt-4">
              {resumes.map((resume) => (
                <li key={resume.id} className="border-t border-line py-3 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => openResume(resume.id)}
                    className="block w-full text-left"
                  >
                    <p className="text-[13px] font-medium">{resume.fileName}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {shortDate(resume.uploadedAt)} · {count(resume.pageCount, 'page')} ·{' '}
                      {count(resume.passageCount, 'passage')}
                      {resume.status === 'unreadable' && <span className="text-warn"> · unreadable</span>}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(resume)}
                    disabled={busy}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted hover:text-bad"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
