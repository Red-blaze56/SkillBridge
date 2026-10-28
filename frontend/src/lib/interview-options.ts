import type {
  CandidateLevel,
  CorrectionMode,
  InterviewStage,
  InterviewStatus,
  PersonalityType,
  ProgrammingLanguage,
} from '@/api/interviews'

// Display text for each allowed value. Typed as Record<Union, string>, so adding a
// value to the API types without a label here is a compile error.
export const LANGUAGE_LABELS: Record<ProgrammingLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  csharp: 'C#',
  ruby: 'Ruby',
  go: 'Go',
  php: 'PHP',
  cpp: 'C++',
  swift: 'Swift',
  kotlin: 'Kotlin',
}

export const LEVEL_LABELS: Record<CandidateLevel, string> = {
  intern: 'Intern',
  fresher: 'Fresher',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
}

export const PERSONALITY_LABELS: Record<PersonalityType, string> = {
  strict: 'Strict',
  warm: 'Warm',
  engineering: 'Engineering',
  academic: 'Academic',
  sarcasm: 'Sarcastic',
  coaching: 'Coaching',
}

// Text shown for each correction mode in the form.
export const CORRECTION_LABELS: Record<CorrectionMode, string> = {
  guided: 'Guided',
  strict: 'Strict',
}

export interface Option<T extends string> {
  value: T
  label: string
}

// Turns an API value list plus its labels into the {value, label} pairs a Select needs.
export function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] {
  return values.map((value) => ({ value, label: labels[value] }))
}

export const STAGE_LABELS: Record<InterviewStage, string> = {
  ice_breaker: 'Ice breaker',
  technical: 'Technical',
  coding: 'Coding',
  behavioral: 'Behavioral',
  wrap_up: 'Wrap-up',
}

export const STATUS_LABELS: Record<InterviewStatus, string> = {
  active: 'In progress',
  finished: 'Finished',
}
