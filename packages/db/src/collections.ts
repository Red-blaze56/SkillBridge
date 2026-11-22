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

/** The resumes collection, read-only for workers. The API creates its indexes. */
export const resumesIn = (db: Db) => db.collection<Owned<StoredResume>>('resumes');
