import { z } from 'zod';
import { Analysis } from '@skillbridge/shared';
import { api } from '../api.ts';

// The shapes the interview service sends, relayed as-is by /api/interviews.
// They use snake_case because that is what the service (FastAPI) answers with.

export const LANGUAGES = ['python', 'javascript', 'java', 'csharp', 'ruby', 'go', 'php', 'cpp', 'swift', 'kotlin'] as const;
export const LEVELS = ['intern', 'fresher', 'junior', 'mid', 'senior'] as const;
// In the order the setup form shows them: the default first.
export const PERSONALITIES = ['warm', 'coaching', 'strict', 'engineering', 'academic', 'sarcasm'] as const;
export const STAGES = ['ice_breaker', 'technical', 'coding', 'behavioral', 'wrap_up'] as const;

export const ProgrammingLanguage = z.enum(LANGUAGES);
export type ProgrammingLanguage = z.infer<typeof ProgrammingLanguage>;
export const CandidateLevel = z.enum(LEVELS);
export type CandidateLevel = z.infer<typeof CandidateLevel>;
export const PersonalityType = z.enum(PERSONALITIES);
export type PersonalityType = z.infer<typeof PersonalityType>;
export const CorrectionMode = z.enum(['strict', 'guided']);
export type CorrectionMode = z.infer<typeof CorrectionMode>;
export const InterviewStage = z.enum(STAGES);
export type InterviewStage = z.infer<typeof InterviewStage>;
export const InterviewStatus = z.enum(['active', 'finished']);

/** UTC, e.g. 2026-11-22T23:06:33.196012Z. An explicit offset is accepted too. */
const Timestamp = z.iso.datetime({ offset: true });

/** Mirrors the service's limits (InterviewCreate in services/interview). */
export const MAX_RESUME_CHARS = 20_000;
export const MAX_JD_CHARS = 5_000;
export const MAX_TOPICS = 8;
export const MAX_TOPIC_CHARS = 80;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const InterviewMessage = z.object({
  id: z.uuid(),
  sender: z.enum(['interviewer', 'candidate']),
  content: z.string(),
  created_at: Timestamp,
});
export type InterviewMessage = z.infer<typeof InterviewMessage>;

/** Scores are out of 10. */
export const InterviewReport = z.object({
  overall_score: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type InterviewReport = z.infer<typeof InterviewReport>;

export const Interview = z.object({
  id: z.uuid(),
  status: InterviewStatus,
  stage: InterviewStage,
  programming_language: ProgrammingLanguage,
  candidate_level: CandidateLevel,
  current_topic: z.string().nullable(),
  covered_topics: z.array(z.string()).nullable(),
  report: InterviewReport.nullable(),
  created_at: Timestamp,
  messages: z.array(InterviewMessage),
});
export type Interview = z.infer<typeof Interview>;

export const InterviewListItem = Interview.pick({
  id: true,
  status: true,
  stage: true,
  programming_language: true,
  candidate_level: true,
  created_at: true,
});
export type InterviewListItem = z.infer<typeof InterviewListItem>;

export const InterviewPage = z.object({
  items: z.array(InterviewListItem),
  next_cursor: z.string().nullable(),
});
export type InterviewPage = z.infer<typeof InterviewPage>;

/** One answer's grade, out of 10. The service's fallback leaves out correct and confident. */
export const Evaluation = z.object({
  score: z.number(),
  feedback: z.string(),
  correct: z.boolean().optional(),
  confident: z.boolean().optional(),
});
export type Evaluation = z.infer<typeof Evaluation>;

export const AnswerResult = z.object({
  interview: Interview,
  evaluation: Evaluation.nullable(),
  should_finish: z.boolean(),
});
export type AnswerResult = z.infer<typeof AnswerResult>;

export const ParsedResume = z.object({
  readable: z.boolean(),
  resume_text: z.string(),
  focus_topics: z.array(z.string()),
});
export type ParsedResume = z.infer<typeof ParsedResume>;

export const NewInterview = z.object({
  programming_language: ProgrammingLanguage,
  candidate_level: CandidateLevel,
  personality_type: PersonalityType,
  correction_mode: CorrectionMode.optional(),
  resume_text: z.string().max(MAX_RESUME_CHARS).optional(),
  jd_text: z.string().max(MAX_JD_CHARS).optional(),
  focus_topics: z.array(z.string().min(1).max(MAX_TOPIC_CHARS)).max(MAX_TOPICS).optional(),
});
export type NewInterview = z.infer<typeof NewInterview>;

/** GET /api/interviews — one page of the student's interviews, newest first. */
export async function listInterviews(cursor?: string | null, signal?: AbortSignal): Promise<InterviewPage> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return InterviewPage.parse(await api<unknown>(`/interviews?${query.toString()}`, { signal }));
}

/**
 * POST /api/interviews/parse-resume — the PDF goes as multipart field `file`. No
 * Content-Type header: the browser sets it, with the boundary, for a FormData body.
 */
export async function parseResume(file: File, signal?: AbortSignal): Promise<ParsedResume> {
  const form = new FormData();
  form.append('file', file);
  return ParsedResume.parse(await api<unknown>('/interviews/parse-resume', { method: 'POST', raw: form, signal }));
}

/** POST /api/interviews — starts an interview (201). Counts against the daily limit. */
export async function startInterview(details: NewInterview): Promise<Interview> {
  return Interview.parse(await api<unknown>('/interviews', { method: 'POST', body: NewInterview.parse(details) }));
}

/** GET /api/interviews/:id */
export async function getInterview(id: string, signal?: AbortSignal): Promise<Interview> {
  return Interview.parse(await api<unknown>(`/interviews/${encodeURIComponent(id)}`, { signal }));
}

/** POST /api/interviews/:id/answer — can take up to a minute while the answer is graded. */
export async function answerInterview(id: string, content: string): Promise<AnswerResult> {
  return AnswerResult.parse(
    await api<unknown>(`/interviews/${encodeURIComponent(id)}/answer`, { method: 'POST', body: { content } }),
  );
}

/** POST /api/interviews/:id/finish — ends the interview and writes its report. */
export async function finishInterview(id: string): Promise<Interview> {
  return Interview.parse(await api<unknown>(`/interviews/${encodeURIComponent(id)}/finish`, { method: 'POST' }));
}

/** The student's newest finished skill gap analysis, or null when there is none. */
export async function latestDoneAnalysis(signal?: AbortSignal): Promise<Analysis | null> {
  const analyses = Analysis.array().parse(await api<unknown>('/analyses', { signal }));
  return analyses.find((a) => a.status === 'done' && a.result !== null) ?? null;
}

/** Up to MAX_TOPICS topics: `first` before `rest`, without repeats (ignoring case) or blanks. */
export function mergeTopics(first: readonly string[], rest: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...first, ...rest]) {
    const topic = raw.trim().slice(0, MAX_TOPIC_CHARS);
    const key = topic.toLowerCase();
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length === MAX_TOPICS) break;
  }
  return out;
}

// Human labels.

export const LANGUAGE_LABEL: Record<ProgrammingLanguage, string> = {
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
};

export const LEVEL_LABEL: Record<CandidateLevel, string> = {
  intern: 'Intern',
  fresher: 'Fresher',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
};

export const PERSONALITY: Record<PersonalityType, { name: string; detail: string }> = {
  warm: { name: 'Warm', detail: 'Friendly and encouraging.' },
  coaching: { name: 'Coach', detail: 'Supportive, like a mentor.' },
  strict: { name: 'Strict', detail: 'Formal and to the point.' },
  engineering: { name: 'Engineer', detail: 'Practical, about real systems.' },
  academic: { name: 'Academic', detail: 'Theory and fundamentals.' },
  sarcasm: { name: 'Sarcastic', detail: 'Dry humour. Bring a thick skin.' },
};

export const STAGE_LABEL: Record<InterviewStage, string> = {
  ice_breaker: 'Ice breaker',
  technical: 'Technical',
  coding: 'Coding',
  behavioral: 'Behavioural',
  wrap_up: 'Wrap-up',
};

/** 7 → "7", 7.25 → "7.3" */
export function score(value: number) {
  return String(Math.round(value * 10) / 10);
}

/** A topic worth showing: the service uses "" and "general" for none. */
export function topicLabel(topic: string | null | undefined) {
  const value = topic?.trim();
  return value && value.toLowerCase() !== 'general' ? value : null;
}
