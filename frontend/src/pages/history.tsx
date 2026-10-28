import { useEffect, useState } from 'react'
import { ChevronRight, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listInterviews, type InterviewListItem } from '@/api/interviews'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LANGUAGE_LABELS, LEVEL_LABELS, STAGE_LABELS, STATUS_LABELS } from '@/lib/interview-options'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      items: InterviewListItem[]
      nextCursor: string | null // null = this is everything
      loadingMore: boolean
      moreError: string | null // a failed "Load more" keeps the list and shows this
    }

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export default function History() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0) // bump to reload the first page

  useEffect(() => {
    let cancelled = false
    listInterviews({ limit: PAGE_SIZE })
      .then((page) => {
        if (!cancelled) {
          setState({ kind: 'ready', items: page.items, nextCursor: page.next_cursor, loadingMore: false, moreError: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: messageOf(err, 'Could not load your interviews.') })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  async function loadMore() {
    if (state.kind !== 'ready' || !state.nextCursor || state.loadingMore) return
    const cursor = state.nextCursor
    setState({ ...state, loadingMore: true, moreError: null })

    try {
      const page = await listInterviews({ cursor, limit: PAGE_SIZE })
      setState((current) => {
        if (current.kind !== 'ready') return current
        // Cursors make repeats unlikely; skipping known ids makes them impossible.
        const known = new Set(current.items.map((item) => item.id))
        const fresh = page.items.filter((item) => !known.has(item.id))
        return { kind: 'ready', items: [...current.items, ...fresh], nextCursor: page.next_cursor, loadingMore: false, moreError: null }
      })
    } catch (err) {
      setState((current) =>
        current.kind === 'ready'
          ? { ...current, loadingMore: false, moreError: messageOf(err, 'Could not load more interviews.') }
          : current,
      )
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">History</CardTitle>
        <CardDescription>Your past interviews, newest first.</CardDescription>
      </CardHeader>

      <CardContent>
        {state.kind === 'loading' && <LoadingRows />}

        {state.kind === 'error' && (
          <div className="flex flex-col items-start gap-3" role="alert">
            <p className="text-sm text-destructive">{state.message}</p>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">No interviews yet.</p>
            <Link to="/" className={cn(buttonVariants({ variant: 'brand', size: 'lg' }), 'h-10 px-6')}>
              Start your first interview
            </Link>
          </div>
        )}

        {state.kind === 'ready' && state.items.length > 0 && (
          <>
            <ul className="divide-y">
              {state.items.map((item) => (
                <li key={item.id}>
                  <InterviewRow item={item} />
                </li>
              ))}
            </ul>

            <div className="flex flex-col items-center gap-2 pt-4">
              {state.moreError && (
                <p className="text-sm text-destructive" role="alert">
                  {state.moreError}
                </p>
              )}
              {state.nextCursor && (
                <Button variant="outline" onClick={() => void loadMore()} disabled={state.loadingMore}>
                  {state.loadingMore && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  {state.loadingMore ? 'Loading…' : state.moreError ? 'Try again' : 'Load more'}
                </Button>
              )}
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {state.nextCursor ? `Showing ${state.items.length}` : `All ${state.items.length} shown`}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function InterviewRow({ item }: { item: InterviewListItem }) {
  const active = item.status === 'active'

  return (
    <Link
      to={`/interviews/${item.id}`}
      className="flex items-center gap-4 rounded-md px-2 py-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {LANGUAGE_LABELS[item.programming_language]} · {LEVEL_LABELS[item.candidate_level]}
        </p>
        <p className="text-sm text-muted-foreground">
          <time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time>
          {active && <> · {STAGE_LABELS[item.stage]}</>}
        </p>
      </div>

      <Badge
        variant={active ? 'outline' : 'secondary'}
        className={cn(
          active &&
            'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
        )}
      >
        {STATUS_LABELS[item.status]}
      </Badge>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading your interviews">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-2">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
