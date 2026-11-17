import { Check } from 'lucide-react'
import { topicLabel } from '@/lib/topics'

interface TopicsChecklistProps {
  covered: string[] // topics the interviewer has finished with
  current: string | null // the topic being asked about right now
}

// What the interviewer has covered and what it is asking about now. Fed by the
// covered_topics and current_topic fields the API already returns.
export function TopicsChecklist({ covered, current }: TopicsChecklistProps) {
  const done = [...new Set(covered)].filter((topic) => topic !== current)
  const empty = done.length === 0 && !current

  return (
    <section aria-label="Topics">
      <h2 className="label-caps border-b pb-2">Topics</h2>

      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">Topics show up here as the interview moves on.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {done.map((topic) => (
            <li key={topic} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
              <Check className="size-4 shrink-0 text-positive" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{topicLabel(topic)}</span>
              <span className="sr-only">covered</span>
            </li>
          ))}
          {current && (
            <li className="flex items-center gap-3 rounded-lg bg-accent px-3 py-2 text-sm" aria-current="true">
              <span className="mx-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium">{topicLabel(current)}</span>
              <span className="text-xs text-muted-foreground">asking now</span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
