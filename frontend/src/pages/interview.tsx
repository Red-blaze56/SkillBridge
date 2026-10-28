import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getInterview, type Interview as InterviewData } from '@/api/interviews'
import { LANGUAGE_LABELS, LEVEL_LABELS } from '@/lib/interview-options'

// Placeholder: shows what the backend returned. Becomes the full-screen chat next.
export default function Interview() {
  const { id } = useParams()
  const [interview, setInterview] = useState<InterviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getInterview(id)
      .then((loaded) => {
        if (!cancelled) setInterview(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the interview.')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-4 p-6">
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        Back
      </Link>

      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!interview && !error && <p className="text-muted-foreground">Loading…</p>}

      {interview && (
        <>
          <h1 className="text-xl font-semibold">
            {LANGUAGE_LABELS[interview.programming_language]} · {LEVEL_LABELS[interview.candidate_level]}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {interview.status} · {interview.stage}
            </span>
          </h1>
          <ul className="flex flex-col gap-3">
            {interview.messages.map((message) => (
              <li key={message.id} className="rounded-lg border p-3">
                <p className="mb-1 text-xs uppercase text-muted-foreground">{message.sender}</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
