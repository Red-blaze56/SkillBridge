import { useState, type SubmitEvent } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  CANDIDATE_LEVELS,
  PERSONALITY_TYPES,
  PROGRAMMING_LANGUAGES,
  createInterview,
  type CandidateLevel,
  type CorrectionMode,
  type InterviewCreate,
  type PersonalityType,
  type ProgrammingLanguage,
} from '@/api/interviews'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  CORRECTION_LABELS,
  LANGUAGE_LABELS,
  LEVEL_LABELS,
  PERSONALITY_LABELS,
  toOptions,
} from '@/lib/interview-options'

interface FormState {
  programming_language: ProgrammingLanguage
  candidate_level: CandidateLevel
  personality_type: PersonalityType
  correction_mode: CorrectionMode
  resume_text: string
  jd_text: string
}

const INITIAL: FormState = {
  programming_language: 'python',
  candidate_level: 'junior',
  personality_type: 'warm',
  correction_mode: 'guided',
  resume_text: '',
  jd_text: '',
}

const LANGUAGE_OPTIONS = toOptions(PROGRAMMING_LANGUAGES, LANGUAGE_LABELS)
const LEVEL_OPTIONS = toOptions(CANDIDATE_LEVELS, LEVEL_LABELS)
const PERSONALITY_OPTIONS = toOptions(PERSONALITY_TYPES, PERSONALITY_LABELS)
const CORRECTION_OPTIONS = toOptions(['guided', 'strict'] as const, CORRECTION_LABELS)

export default function Home() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // set('candidate_level') returns a handler that only accepts a CandidateLevel.
  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }))

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // Optional texts are left out entirely when empty.
    const resume = form.resume_text.trim()
    const jd = form.jd_text.trim()
    const payload: InterviewCreate = {
      programming_language: form.programming_language,
      candidate_level: form.candidate_level,
      personality_type: form.personality_type,
      correction_mode: form.correction_mode,
      ...(resume ? { resume_text: resume } : {}),
      ...(jd ? { jd_text: jd } : {}),
    }

    try {
      const interview = await createInterview(payload)
      navigate(`/interviews/${interview.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="size-5 text-purple-600" aria-hidden="true" />
          Configure Session
        </CardTitle>
        <CardDescription>Customize your mock interview. These settings are fixed once it starts.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldSet disabled={submitting} className="gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <SelectField
                id="language"
                label="Language"
                value={form.programming_language}
                onChange={set('programming_language')}
                options={LANGUAGE_OPTIONS}
              />
              <SelectField
                id="level"
                label="Experience level"
                value={form.candidate_level}
                onChange={set('candidate_level')}
                options={LEVEL_OPTIONS}
              />
              <SelectField
                id="personality"
                label="Interviewer persona"
                value={form.personality_type}
                onChange={set('personality_type')}
                options={PERSONALITY_OPTIONS}
              />
              <SelectField
                id="correction"
                label="Correction Mode"
                value={form.correction_mode}
                onChange={set('correction_mode')}
                options={CORRECTION_OPTIONS}
              />
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="resume">Resume (optional)</FieldLabel>
                <Textarea
                  id="resume"
                  rows={5}
                  placeholder="Paste your resume text"
                  value={form.resume_text}
                  onChange={(e) => set('resume_text')(e.target.value)}
                />
                <FieldDescription>The interviewer can ask about what's on it.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="jd">Job description (optional)</FieldLabel>
                <Textarea
                  id="jd"
                  rows={5}
                  placeholder="Paste the job posting or the requirements you're preparing for"
                  value={form.jd_text}
                  onChange={(e) => set('jd_text')(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          {error && <FieldError>{error}</FieldError>}

          <div className="flex flex-col items-center gap-2">
            <Button type="submit" variant="brand" size="lg" className="h-10 px-8" disabled={submitting}>
              {submitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {submitting ? 'Starting interview…' : 'Start interview'}
            </Button>
            {submitting && (
              <p className="text-xs text-muted-foreground" role="status">
                The interviewer is preparing the first question. This takes a few seconds.
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
