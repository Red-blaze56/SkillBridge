// Collections used by more than one process (the API and the workers).
import type { Collection, Db, ObjectId } from 'mongodb';
import type { AnalysisResult, AnalysisStatus, Passage } from '@skillbridge/shared';
import { once } from './once.ts';
import type { Owned } from './owned.ts';

/** What a worker reads from a stored resume. The API owns the full shape. */
export interface StoredResume {
  passages: Passage[];
  status: 'parsed' | 'unreadable';
  expiresAt: Date;
}

export interface AnalysisDoc {
  resumeId: ObjectId;
  roleId: string;
  roleVersion: string;
  promptVersion: string;
  formulaVersion: string;
  model: string;
  status: AnalysisStatus;
  /** A worker that claims the job holds it until this time; null when nobody does. */
  leaseUntil: Date | null;
  attempts: number;
  result: AnalysisResult | null;
  /** Shown to the student when status is failed. */
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Same as the resume's: a TTL index deletes the analysis with it. */
  expiresAt: Date;
}

export type AnalysisCollection = () => Promise<Collection<Owned<AnalysisDoc>>>;

export function lazyAnalyses(getDb: () => Promise<Db>): AnalysisCollection {
  return once(async () => {
    const c = (await getDb()).collection<Owned<AnalysisDoc>>('analyses');
    await Promise.all([
      c.createIndex({ userId: 1, resumeId: 1, createdAt: -1 }),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return c;
  });
}

/**
 * A job posting the jobs worker keeps, shared by every student (it isn't personal data).
 * Only what matching and the list need is stored, not the full description.
 */
export interface JobPostingDoc {
  /** "<ats>:<slug>:<job id>" */
  _id: string;
  ats: string;
  slug: string;
  company: string;
  title: string;
  location: string;
  url: string;
  remote: boolean;
  inIndia: boolean;
  /** Years asked for, e.g. "0-2", or null when the posting doesn't say. */
  experience: string | null;
  /** Skill ids the posting names. */
  skills: string[];
  /** Target role ids it suits. */
  roles: string[];
  /** Same company and title: the same job listed twice. */
  fingerprint: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  fetchedAt: Date;
  /** A TTL index deletes postings whose board stopped being refreshed. */
  expiresAt: Date;
}

/** How each company board did the last time the worker read it. */
export interface JobBoardDoc {
  /** "<ats>:<slug>" */
  _id: string;
  name: string;
  status: 'ok' | 'gone' | 'error';
  /** Open jobs on the board, and how many of them were kept. */
  open: number;
  kept: number;
  error: string | null;
  checkedAt: Date;
}

export type JobPostingCollection = () => Promise<Collection<JobPostingDoc>>;
export type JobBoardCollection = () => Promise<Collection<JobBoardDoc>>;

export function lazyJobPostings(getDb: () => Promise<Db>): JobPostingCollection {
  return once(async () => {
    const c = (await getDb()).collection<JobPostingDoc>('jobPostings');
    await Promise.all([
      c.createIndex({ roles: 1, postedAt: -1 }),
      c.createIndex({ ats: 1, slug: 1 }),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return c;
  });
}

export function lazyJobBoards(getDb: () => Promise<Db>): JobBoardCollection {
  return once(async () => (await getDb()).collection<JobBoardDoc>('jobBoards'));
}

/** The resumes collection, read-only for workers. The API creates its indexes. */
export const resumesIn = (db: Db) => db.collection<Owned<StoredResume>>('resumes');
