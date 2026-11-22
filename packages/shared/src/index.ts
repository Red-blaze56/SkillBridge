import { z } from 'zod';

/** The signed-in user a request runs as. `uid` is the user's MongoDB id. */
export const AuthUser = z.object({
  uid: z.string().min(1),
  email: z.email(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Response of GET /api/health. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  database: z.enum(['up', 'down']),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const PASSWORD_MIN_LENGTH = 12;
/** An upper bound keeps one sign-in from costing unbounded hashing time. */
export const PASSWORD_MAX_LENGTH = 128;

/** Emails are compared trimmed and lower-case everywhere. */
export const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

/** Rules for choosing a new password: long, with no forced symbols. */
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

/** POST /api/auth/login */
export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** POST /api/auth/accept-invite and /api/auth/reset-password */
export const SetPasswordRequest = z.object({
  token: z.string().min(1).max(100),
  password: NewPassword,
});

// ── Resumes ────────────────────────────────────────────────────────────────

/** Which part of the resume a passage came from. "header" is the name/contact block. */
export const ResumeSection = z.enum([
  'header',
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'achievements',
  'other',
]);
export type ResumeSection = z.infer<typeof ResumeSection>;

/** A numbered piece of the resume (a bullet, a line or a paragraph). Evidence cites passages by id. */
export const Passage = z.object({
  id: z.number().int().positive(),
  section: ResumeSection,
  page: z.number().int().positive(),
  text: z.string(),
});
export type Passage = z.infer<typeof Passage>;

/** Text in the PDF that a reader can't see, removed before anything reads the resume. */
export const HiddenText = z.object({
  page: z.number().int().positive(),
  reason: z.enum(['invisible', 'transparent', 'too-small', 'off-page', 'blends-into-background']),
  preview: z.string(),
});
export type HiddenText = z.infer<typeof HiddenText>;

export const ResumeQuality = z.object({
  /** False when the text couldn't be read well enough to analyse (e.g. a scanned PDF). */
  readable: z.boolean(),
  /** Why it isn't readable. */
  problems: z.array(z.string()),
  /** Things worth knowing that don't stop the analysis. */
  notes: z.array(z.string()),
});
export type ResumeQuality = z.infer<typeof ResumeQuality>;

/** A resume in GET /api/resumes. */
export const ResumeSummary = z.object({
  id: z.string(),
  fileName: z.string(),
  uploadedAt: z.iso.datetime(),
  status: z.enum(['parsed', 'unreadable']),
  pageCount: z.number().int(),
  passageCount: z.number().int(),
  hiddenCount: z.number().int(),
});
export type ResumeSummary = z.infer<typeof ResumeSummary>;

/** GET /api/resumes/:id and the response to an upload. */
export const ResumeDetail = ResumeSummary.extend({
  columns: z.array(z.number().int()),
  passages: z.array(Passage),
  hidden: z.array(HiddenText),
  quality: ResumeQuality,
});
export type ResumeDetail = z.infer<typeof ResumeDetail>;

// ── Roles and skill analysis ───────────────────────────────────────────────

/** GET /api/roles */
export const RoleSummary = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  summary: z.string(),
  skills: z.array(z.object({ id: z.string(), name: z.string(), weight: z.number().int().min(1).max(3) })),
});
export type RoleSummary = z.infer<typeof RoleSummary>;

/** 0 = absent, 1 = mentioned, 2 = applied (project), 3 = professional (job or internship). */
export const EvidenceLevel = z.number().int().min(0).max(3);

export const SkillAssessment = z.object({
  skillId: z.string(),
  name: z.string(),
  weight: z.number().int().min(1).max(3),
  level: EvidenceLevel,
  /** The resume passage that shows the skill, quoted word for word. Null at level 0. */
  evidence: z.object({ passageId: z.number().int().positive(), section: ResumeSection, quote: z.string() }).nullable(),
  /** Why a level was lowered, e.g. a skills list can only show a skill is known. */
  note: z.string().nullable(),
  /** What this skill adds to the score. */
  points: z.number(),
});
export type SkillAssessment = z.infer<typeof SkillAssessment>;

export const SkillGap = z.object({
  skillId: z.string(),
  name: z.string(),
  weight: z.number().int().min(1).max(3),
  level: EvidenceLevel,
  target: EvidenceLevel,
});
export type SkillGap = z.infer<typeof SkillGap>;

export const AnalysisResult = z.object({
  /** Readiness, 0-100: 100 × Σ weight × (level / 3) / Σ weight. */
  score: z.number().min(0).max(100),
  skills: z.array(SkillAssessment),
  /** Skills below their target level, most important first. */
  gaps: z.array(SkillGap),
  // Everything needed to reproduce the score.
  roleId: z.string(),
  roleVersion: z.string(),
  formulaVersion: z.string(),
  promptVersion: z.string(),
  model: z.string(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

export const AnalysisStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

/** GET /api/analyses/:id */
export const Analysis = z.object({
  id: z.string(),
  resumeId: z.string(),
  roleId: z.string(),
  status: AnalysisStatus,
  createdAt: z.iso.datetime(),
  result: AnalysisResult.nullable(),
  error: z.string().nullable(),
});
export type Analysis = z.infer<typeof Analysis>;

/** POST /api/analyses */
export const AnalysisRequest = z.object({
  resumeId: z.string().regex(/^[0-9a-f]{24}$/),
  roleId: z.string().min(1).max(64),
});

/** The RabbitMQ job that runs one analysis. The API publishes it; workers/evidence handles it. */
export const ANALYZE_JOB = 'analyze';
export const AnalysisJob = z.object({ analysisId: z.string().regex(/^[0-9a-f]{24}$/) });
export type AnalysisJob = z.infer<typeof AnalysisJob>;

// ── Job matching ───────────────────────────────────────────────────────────

/** The RabbitMQ job that reads one company's job board. workers/jobs publishes and handles it. */
export const FETCH_BOARD_JOB = 'fetch-board';
export const FetchBoardJob = z.object({
  ats: z.string().min(1).max(32),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
});
export type FetchBoardJob = z.infer<typeof FetchBoardJob>;

export const MatchedSkill = z.object({
  skillId: z.string(),
  name: z.string(),
  level: EvidenceLevel,
  weight: z.number().int().min(1).max(3),
});
export type MatchedSkill = z.infer<typeof MatchedSkill>;

export const JobMatch = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  url: z.string(),
  remote: z.boolean(),
  postedAt: z.iso.datetime().nullable(),
  /** Years asked for, e.g. "0-2", or null when the posting doesn't say. */
  experience: z.string().nullable(),
  /** 0-100, or null when the posting names none of the analysed skills. */
  score: z.number().min(0).max(100).nullable(),
  /** Shown at project level or better. */
  strong: z.array(MatchedSkill),
  /** Only listed on the resume. */
  weak: z.array(MatchedSkill),
  /** Not shown on the resume. */
  missing: z.array(MatchedSkill),
  /** Named by the posting but outside the analysed role (skill names). */
  unchecked: z.array(z.string()),
});
export type JobMatch = z.infer<typeof JobMatch>;

/** GET /api/jobs/matches */
export const JobMatches = z.object({
  /** The analysis the matches are scored against; null until the student has a finished one. */
  analysis: z
    .object({ id: z.string(), resumeId: z.string(), roleId: z.string(), score: z.number(), createdAt: z.iso.datetime() })
    .nullable(),
  matches: z.array(JobMatch),
  /** Postings for this role before the limit. */
  total: z.number().int().min(0),
  /** When the newest posting was fetched; null before the first refresh. */
  updatedAt: z.iso.datetime().nullable(),
});
export type JobMatches = z.infer<typeof JobMatches>;

// ── Learning roadmap ───────────────────────────────────────────────────────

export const RoadmapResource = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  url: z.string(),
  kind: z.enum(['docs', 'course', 'tutorial', 'practice', 'book']),
  hours: z.number(),
});
export type RoadmapResource = z.infer<typeof RoadmapResource>;

export const RoadmapStep = z.object({
  skillId: z.string(),
  name: z.string(),
  weight: z.number().int().min(1).max(3),
  from: EvidenceLevel,
  to: EvidenceLevel,
  /** What the student should be able to do afterwards. */
  objective: z.string(),
  /** What to build or do. */
  activity: z.string(),
  /** The resume evidence that shows the step is done. */
  doneWhen: z.string(),
  hours: z.number(),
  /** Earlier steps this one builds on. */
  prerequisites: z.array(z.string()),
  resources: z.array(RoadmapResource),
});
export type RoadmapStep = z.infer<typeof RoadmapStep>;

/** GET /api/analyses/:id/roadmap */
export const Roadmap = z.object({
  analysisId: z.string(),
  roleId: z.string(),
  steps: z.array(RoadmapStep),
  totalHours: z.number(),
  weeks: z.number().int(),
  hoursPerWeek: z.number(),
  /** When every catalogue link last answered. */
  catalogueCheckedAt: z.string(),
});
export type Roadmap = z.infer<typeof Roadmap>;
