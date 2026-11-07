import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { finishInterview, getInterview, submitAnswer, type Interview } from '@/api/interviews'
import { AnswerInput } from '@/components/AnswerInput'
import { CameraPreview } from '@/components/CameraPreview'
import { FinishDialog } from '@/components/FinishDialog'
import { LiveTranscript } from '@/components/LiveTranscript'
import { ReportView } from '@/components/ReportView'
import { RichText } from '@/components/RichText'
import { StatusLine, type InterviewStatusKind } from '@/components/StatusLine'
import { TopicsChecklist } from '@/components/TopicsChecklist'
import { TranscriptSheet } from '@/components/TranscriptSheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { LANGUAGE_LABELS, LEVEL_LABELS, STAGE_LABELS } from '@/lib/interview-options'
import { formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export default function InterviewPage() {
  const { id } = useParams()
  if (!id) return <Navigate to="/history" replace />
  // key={id}: opening a different interview starts from a clean state.
  return <InterviewScreen key={id} id={id} />
}

function InterviewScreen({ id }: { id: string }) {
  const [interview, setInterview] = useState<Interview | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; notFound: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0) // bump to reload

  const [sending, setSending] = useState(false)
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [shouldFinish, setShouldFinish] = useState(false) // the interviewer said it's wrapping up
  const [actionError, setActionError] = useState<string | null>(null)

  const sessionSeconds = useSessionTimer(interview?.status === 'active')

  useEffect(() => {
    let cancelled = false
    getInterview(id)
      .then((loaded) => {
        if (!cancelled) setInterview(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError({
            message: messageOf(err, 'Could not load this interview.'),
            // 404: not yours or doesn't exist. 422: the id in the URL isn't even a UUID.
            notFound: err instanceof ApiError && (err.status === 404 || err.status === 422),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  function retryLoad() {
    setLoadError(null)
    setAttempt((n) => n + 1)
  }

  // Rejects on failure so AnswerInput keeps the text the user typed.
  async function handleSend(text: string) {
    setActionError(null)
    setSending(true)
    setPendingAnswer(text)
    try {
      const result = await submitAnswer(id, text)
      setInterview(result.interview)
      if (result.should_finish) setShouldFinish(true)
    } catch (err) {
      setActionError(messageOf(err, 'Your answer could not be sent. Please try again.'))
      throw err
    } finally {
      setSending(false)
      setPendingAnswer(null)
    }
  }

  async function handleFinish() {
    setActionError(null)
    setFinishing(true)
    try {
      setInterview(await finishInterview(id))
    } catch (err) {
      setActionError(messageOf(err, 'Could not finish the interview. Please try again.'))
    } finally {
      setFinishing(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <Card className="mx-auto mt-10 max-w-md">
          <CardHeader>
            <CardTitle>{loadError.notFound ? 'Interview not found' : "Couldn't load the interview"}</CardTitle>
            <CardDescription role="alert">
              {loadError.notFound ? "It doesn't exist, the link is wrong, or it belongs to another account." : loadError.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            {!loadError.notFound && (
              <Button variant="outline" className="rounded-full" onClick={retryLoad}>
                Try again
              </Button>
            )}
            <Link to="/history" className={cn(buttonVariants({ variant: 'outline' }), 'rounded-full')}>
              Back to history
            </Link>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (!interview) {
    return (
      <Shell>
        <div className="mx-auto mt-10 w-full max-w-6xl px-4" role="status" aria-label="Loading the interview">
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </Shell>
    )
  }

  const finished = interview.status === 'finished'
  const busy = sending || finishing
  const messages = interview.messages
  const answered = messages.filter((m) => m.sender === 'candidate').length
  const questionNumber = messages.filter((m) => m.sender === 'interviewer').length
  const currentQuestion = messages.findLast((m) => m.sender === 'interviewer')?.content
  const lastAnswer = pendingAnswer ?? messages.findLast((m) => m.sender === 'candidate')?.content
  const title = `${LANGUAGE_LABELS[interview.programming_language]} · ${LEVEL_LABELS[interview.candidate_level]}`
  const statusKind: InterviewStatusKind = finishing ? 'report' : sending ? 'thinking' : 'ready'
  const topicNow = interview.current_topic?.trim() ? interview.current_topic : null

  return (
    <Shell>
      <header className="sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b bg-background/95 px-3 backdrop-blur">
        <Link
          to="/history"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-full')}
          title={finished ? 'Back to history' : 'Leave now, continue later from History'}
        >
          <ChevronLeft />
          {finished ? 'History' : 'Exit'}
        </Link>

        <p className="truncate text-center text-sm font-semibold">{title} interview</p>

        <div className="flex items-center justify-end gap-2">
          {!finished && <SessionClock seconds={sessionSeconds} />}
          <TranscriptSheet messages={messages} className="lg:hidden" />
          {!finished && (
            <FinishDialog
              answered={answered}
              highlight={shouldFinish}
              disabled={busy}
              className="lg:hidden"
              onConfirm={() => void handleFinish()}
            />
          )}
        </div>
      </header>

      {finished ? (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8">
          <div className="text-center">
            <h1 className="font-heading text-3xl font-semibold">Interview report</h1>
            <p className="text-sm text-muted-foreground">
              {title} · {new Date(interview.created_at).toLocaleDateString()}
            </p>
          </div>

          {interview.report ? (
            <ReportView report={interview.report} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Report unavailable</CardTitle>
                <CardDescription>This interview was finished without a report.</CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="flex justify-center gap-3">
            <Link to="/" className={cn(buttonVariants({ size: 'lg' }), 'h-10 rounded-full px-6')}>
              New interview
            </Link>
            <Link to="/history" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 rounded-full px-6')}>
              History
            </Link>
          </div>
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[1.05fr_1fr]">
          <h1 className="sr-only">Interview in progress</h1>

          {/* Left: the question, whose turn it is, and the answer box. */}
          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm lg:p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Question {questionNumber}
              </span>
              <span className="label-caps">{STAGE_LABELS[interview.stage]}</span>
            </div>

            <div aria-live="polite" className={cn('min-h-32 flex-1 transition-opacity', busy && 'opacity-60')}>
              {finishing ? (
                <p className="text-xl text-muted-foreground">Writing your report. This takes a few seconds.</p>
              ) : (
                <p className="max-h-[40svh] overflow-y-auto font-heading text-2xl leading-snug font-medium whitespace-pre-wrap">
                  {currentQuestion && <RichText text={currentQuestion} />}
                </p>
              )}
            </div>

            <StatusLine kind={statusKind} />

            {lastAnswer && (
              <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                <span className="label-caps mb-1 block">Your last answer</span>
                <p className="line-clamp-4 whitespace-pre-wrap">{lastAnswer}</p>
              </div>
            )}

            {shouldFinish && !finishing && (
              <p role="status" className="rounded-xl border bg-muted px-4 py-3 text-sm">
                The interviewer has wrapped up. Finish when you're ready to see your report.
              </p>
            )}

            {actionError && <FieldError>{actionError}</FieldError>}

            {/* On phones the box sticks to the bottom of the screen. */}
            <div className="max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:bg-card max-lg:px-5 max-lg:pt-2 max-lg:pb-4">
              <AnswerInput onSend={handleSend} sending={sending} disabled={shouldFinish || finishing} />
            </div>
          </section>

          {/* Right: the optional camera, the transcript (desktop; phones use the drawer), the topics,
              and the finish button. */}
          <aside className="flex flex-col gap-6">
            <CameraPreview />
            <div className="hidden lg:block">
              <LiveTranscript messages={messages} />
            </div>
            <TopicsChecklist covered={interview.covered_topics ?? []} current={topicNow} />
            <FinishDialog
              label="Complete & view report"
              answered={answered}
              highlight={shouldFinish}
              disabled={busy}
              className="hidden h-10 px-6 lg:inline-flex lg:self-end"
              onConfirm={() => void handleFinish()}
            />
          </aside>
        </main>
      )}
    </Shell>
  )
}

function SessionClock({ seconds }: { seconds: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium tabular-nums">
      <span className="label-caps max-sm:sr-only">Session</span>
      {formatDuration(seconds)}
    </span>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh flex-col bg-background">{children}</div>
}
