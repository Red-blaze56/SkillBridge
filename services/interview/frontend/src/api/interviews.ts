import { request } from './client';

export const PROGRAMMING_LANGUAGES = ['python', 'javascript', 'java', 'csharp', 'ruby', 'go', 'php', 'cpp', 'swift', 'kotlin',] as const
export const CANDIDATE_LEVELS = ['intern', 'fresher', 'junior', 'mid', 'senior'] as const
export const PERSONALITY_TYPES = ['strict', 'warm', 'engineering', 'academic', 'sarcasm', 'coaching'] as const
export const CORRECTION_MODES = ['strict', 'guided'] as const

export type ProgrammingLanguage = (typeof PROGRAMMING_LANGUAGES)[number]
export type CandidateLevel = (typeof CANDIDATE_LEVELS)[number]
export type PersonalityType = (typeof PERSONALITY_TYPES)[number]
export type CorrectionMode = (typeof CORRECTION_MODES)[number]

export type InterviewStatus = 'active' | 'finished'
export type InterviewStage = 'ice_breaker' | 'technical' | 'coding' | 'behavioral' | 'wrap_up'
export type Sender = 'interviewer' | 'candidate'


export interface InterviewCreate{
    programming_language: ProgrammingLanguage
    candidate_level: CandidateLevel
    personality_type: PersonalityType
    correction_mode: CorrectionMode
    resume_text?: string | null
    jd_text?: string | null
    focus_topics?: string[] // from parseResume, sent along with its resume_text
}

// What the backend pulled out of an uploaded resume PDF. resume_text is empty when the
// PDF has no readable text (a scanned image, say); focus_topics is then empty too.
export interface ParsedResume {
  resume_text: string
  focus_topics: string[]
}

export interface Message {
  id: string
  sender: Sender
  content: string
  created_at: string 
}

export interface Evaluation {
  score: number
  feedback: string
  correct: boolean
  confident: boolean
}

export interface Report {
  overall_score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
}

export interface Interview {
  id: string
  status: InterviewStatus
  stage: InterviewStage
  programming_language: ProgrammingLanguage
  candidate_level: CandidateLevel
  current_topic: string | null
  covered_topics: string[] | null
  report: Report | null // set once the interview is finished
  created_at: string
  messages: Message[]
}

// Pick<T, K> 
export type InterviewListItem = Pick<
  Interview,
  'id' | 'status' | 'stage' | 'programming_language' | 'candidate_level' | 'created_at'
>

export interface AnswerResponse {
  interview: Interview
  evaluation: Evaluation | null
  should_finish: boolean
}

export function createInterview(payload: InterviewCreate): Promise<Interview> {
  return request<Interview>('/interviews', { method: 'POST', json: payload })
}

export function parseResume(file: File): Promise<ParsedResume> {
  const body = new FormData()
  body.append('file', file)
  return request<ParsedResume>('/interviews/parse-resume', { method: 'POST', multipart: body })
}

// One page of the list. Pass the previous page's next_cursor to get the next one;
// next_cursor is null on the last page. The cursor is opaque: don't build or parse it.
export interface InterviewListPage {
  items: InterviewListItem[]
  next_cursor: string | null
}

export function listInterviews(
  { cursor, limit }: { cursor?: string | null; limit?: number } = {},
): Promise<InterviewListPage> {
  const params = new URLSearchParams()
  if (limit !== undefined) params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  return request<InterviewListPage>(query ? `/interviews?${query}` : '/interviews')
}

export function getInterview(id: string): Promise<Interview> {
  return request<Interview>(`/interviews/${encodeURIComponent(id)}`)
}

export function submitAnswer(id: string, content: string): Promise<AnswerResponse> {
  return request<AnswerResponse>(`/interviews/${encodeURIComponent(id)}/answer`, { method: 'POST', json: { content },})
}

export function finishInterview(id: string): Promise<Interview> {
  return request<Interview>(`/interviews/${encodeURIComponent(id)}/finish`, { method: 'POST' })
}
