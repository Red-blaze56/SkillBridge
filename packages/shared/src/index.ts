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
