import { cn } from '@/lib/utils'

export type InterviewStatusKind = 'ready' | 'thinking' | 'report'

const LABELS: Record<InterviewStatusKind, string> = {
  ready: 'Your turn',
  thinking: 'The interviewer is thinking…',
  report: 'Writing your report…',
}

// One quiet line saying whose turn it is. The dot pulses while the AI is working.
export function StatusLine({ kind }: { kind: InterviewStatusKind }) {
  const working = kind !== 'ready'

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          working ? 'bg-primary motion-safe:animate-pulse' : 'border border-muted-foreground',
        )}
      />
      {LABELS[kind]}
    </p>
  )
}
