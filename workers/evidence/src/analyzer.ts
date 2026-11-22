// Runs one analysis job: claim it, read the student's resume, let the evidence agent
// assess it, and save the score. Jobs can arrive twice (RabbitMQ redelivers after a
// crash), so a job is claimed with a lease first and finished jobs are skipped.
import { ObjectId, type Db } from 'mongodb';
import { analyse, type ModelFactory } from '@skillbridge/analysis';
import { ownedBy, resumesIn, type AnalysisCollection } from '@skillbridge/db';
import { PermanentError } from '@skillbridge/queue';
import { getRole } from '@skillbridge/roles';
import type { AnalysisJob } from '@skillbridge/shared';

/**
 * How long a worker holds a claimed job. It must outlast one run (MAX_ROUNDS Gemini
 * calls of CALL_TIMEOUT_MS each, 4 min) and be shorter than the queue's retry delays
 * added up (5 s + 30 s + 5 min), so the last retry can take over from a crashed worker.
 */
export const LEASE_MS = 5 * 60_000;

/** What the student sees when the AI couldn't finish after every retry. */
export const TRY_AGAIN = 'The analysis could not be finished. Please try again in a few minutes.';

export interface AnalyzerDeps {
  analyses: AnalysisCollection;
  db: () => Promise<Db>;
  model: ModelFactory;
  modelName: string;
  now?: () => Date;
  leaseMs?: number;
}

export function createAnalyzer({ analyses, db, model, modelName, now = () => new Date(), leaseMs = LEASE_MS }: AnalyzerDeps) {
  return {
    async handle(job: AnalysisJob): Promise<void> {
      const _id = new ObjectId(job.analysisId);
      const c = await analyses();
      const start = now();

      const claimed = await c.findOneAndUpdate(
        { _id, status: { $in: ['queued', 'running'] }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: start } }] },
        { $set: { status: 'running', leaseUntil: new Date(start.getTime() + leaseMs), updatedAt: start }, $inc: { attempts: 1 } },
        { returnDocument: 'after' },
      );
      if (!claimed) {
        const current = await c.findOne({ _id }, { projection: { status: 1, leaseUntil: 1 } });
        // Deleted with its resume, or a second delivery of a finished job: nothing to do.
        if (!current || current.status === 'done' || current.status === 'failed') return;
        // Another worker holds it. If that worker died, a later retry finds the lease expired.
        throw new Error(`Analysis ${job.analysisId} is held by another worker until ${current.leaseUntil?.toISOString()}`);
      }

      try {
        const role = getRole(claimed.roleId);
        if (!role) throw new PermanentError(`There is no role called "${claimed.roleId}" any more.`);

        // Only the analysis owner's resume, even though the worker isn't a signed-in request.
        const resume = await ownedBy(resumesIn(await db()), claimed.userId).findOne(
          { _id: claimed.resumeId },
          { projection: { passages: 1, status: 1 } },
        );
        if (!resume) throw new PermanentError('The resume was deleted.');
        if (resume.status !== 'parsed' || resume.passages.length === 0) {
          throw new PermanentError('This resume has no readable text to analyse.');
        }

        const result = await analyse({ role, passages: resume.passages, model, modelName });
        await c.updateOne(
          { _id, status: 'running' },
          { $set: { status: 'done', result, error: null, leaseUntil: null, updatedAt: now() } },
        );
      } catch (error) {
        // Let the next attempt claim it straight away instead of waiting out the lease.
        await c
          .updateOne({ _id, status: 'running' }, { $set: { leaseUntil: null, updatedAt: now() } })
          .catch(() => undefined);
        throw error;
      }
    },

    /** The queue gave up on the job: tell the student, unless it finished after all. */
    async onGiveUp(job: AnalysisJob, error: unknown): Promise<void> {
      const c = await analyses();
      await c.updateOne(
        { _id: new ObjectId(job.analysisId), status: { $in: ['queued', 'running'] } },
        {
          $set: {
            status: 'failed',
            error: error instanceof PermanentError ? error.message : TRY_AGAIN,
            leaseUntil: null,
            updatedAt: now(),
          },
        },
      );
    },
  };
}
