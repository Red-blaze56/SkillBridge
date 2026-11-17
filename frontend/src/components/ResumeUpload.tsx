import { useRef, useState, type DragEvent } from 'react'
import { FileText, FileUp, LoaderCircle, X } from 'lucide-react'
import { parseResume, type ParsedResume } from '@/api/interviews'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_BYTES = 10 * 1024 * 1024 // the backend refuses anything bigger

type State =
  | { kind: 'empty' }
  | { kind: 'reading'; name: string }
  | { kind: 'done'; name: string; result: ParsedResume }
  | { kind: 'error'; message: string }

interface ResumeUploadProps {
  id: string
  describedBy?: string
  disabled?: boolean
  // The parsed resume, or null when there is none (or no text could be read from it).
  onChange: (resume: ParsedResume | null) => void
  onBusyChange: (busy: boolean) => void
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// Resume as a PDF: dropped on the box or picked with the button. The backend reads it
// straight away (POST /interviews/parse-resume), so the text is ready by the time the
// form is sent.
export function ResumeUpload({ id, describedBy, disabled = false, onChange, onBusyChange }: ResumeUploadProps) {
  const [state, setState] = useState<State>({ kind: 'empty' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Bumped for every new file and on remove, so a slow reply for an old file is ignored.
  const latest = useRef(0)

  async function read(file: File) {
    onChange(null)
    if (!isPdf(file)) {
      setState({ kind: 'error', message: 'Please choose a PDF file.' })
      return
    }
    if (file.size > MAX_BYTES) {
      setState({ kind: 'error', message: 'Please upload a PDF under 10 MB.' })
      return
    }

    const ticket = ++latest.current
    setState({ kind: 'reading', name: file.name })
    onBusyChange(true)
    try {
      const result = await parseResume(file)
      if (ticket !== latest.current) return
      setState({ kind: 'done', name: file.name, result })
      onChange(result.resume_text ? result : null)
    } catch (err) {
      if (ticket !== latest.current) return
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read this PDF.' })
    } finally {
      if (ticket === latest.current) onBusyChange(false)
    }
  }

  function remove() {
    latest.current++
    onBusyChange(false)
    onChange(null)
    setState({ kind: 'empty' })
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && !disabled) void read(file)
  }

  if (state.kind === 'reading' || state.kind === 'done') {
    const reading = state.kind === 'reading'
    const result = state.kind === 'done' ? state.result : null
    let detail = 'Reading your resume…'
    if (result) {
      const topics = result.focus_topics.length
      detail = !result.resume_text
        ? "No text could be read from this PDF (it may be a scanned image), so the interview won't use it."
        : topics > 0
          ? `${topics} ${topics === 1 ? 'topic' : 'topics'} the interviewer can ask about.`
          : 'Read. The interviewer can ask about it.'
    }

    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3" aria-live="polite">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
          {reading ? (
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <FileText className="size-5 text-primary" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{state.name}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={reading ? 'Cancel reading this resume' : `Remove ${state.name}`}
          disabled={disabled}
          onClick={remove}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed bg-background px-4 py-6 text-center transition-colors',
          dragging && 'border-primary bg-accent',
          disabled && 'opacity-50',
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent">
          <FileUp className="size-5 text-primary" aria-hidden="true" />
        </span>
        <p className="text-sm">Drag your resume PDF here, or</p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          aria-describedby={describedBy}
          disabled={disabled}
          className="peer sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void read(file)
          }}
        />
        <label
          htmlFor={id}
          className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-primary bg-card px-4 text-[13px] font-semibold text-primary hover:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
        >
          Choose PDF
        </label>
      </div>
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  )
}
