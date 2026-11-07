import type { Report } from '@/api/interviews'
import { RichText } from '@/components/RichText'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// The backend doesn't state a range for the overall score. The per-answer scale in its
// prompt is 1-10, so this assumes the same.
const SCORE_MAX = 10

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function BulletCard({ title, items, titleClassName }: { title: string; items: string[]; titleClassName?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className={cn('text-lg font-semibold', titleClassName)}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to report.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm">
            {items.map((item, i) => (
              <li key={i}>
                <RichText text={item} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportView({ report }: { report: Report }) {
  // If the AI call failed, the backend stores an empty report. Say so instead of showing "0/10".
  const empty =
    !report.summary && !report.strengths.length && !report.weaknesses.length && !report.suggestions.length

  if (empty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Report unavailable</CardTitle>
          <CardDescription>The report couldn't be generated for this interview.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription>Overall score</CardDescription>
          {/* The score is where the report judges you, so it gets the red. */}
          <CardTitle className="text-6xl font-semibold text-signal">
            {formatScore(report.overall_score)}
            <span className="text-2xl font-medium text-muted-foreground"> / {SCORE_MAX}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">
            <RichText text={report.summary} />
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <BulletCard title="Strengths" items={report.strengths} />
        <BulletCard title="Weaknesses" items={report.weaknesses} titleClassName="text-signal" />
        <BulletCard title="Suggestions" items={report.suggestions} />
      </div>
    </div>
  )
}
