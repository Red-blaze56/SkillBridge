// Keeps the shared list of job postings fresh. Every REFRESH_HOURS, one worker claims
// the refresh and queues a fetch-board job per company; each job reads that board,
// keeps the fresher-friendly developer jobs and replaces the board's postings.
import type { Db } from 'mongodb';
import type { JobBoardCollection, JobPostingCollection, JobPostingDoc } from '@skillbridge/db';
import {
  dropReason,
  experience,
  fetchBoard,
  fillDescription,
  fingerprint,
  inIndia,
  isAts,
  isRemote,
  rolesFor,
  skillsIn,
  type Board,
  type Fetch,
  type Posting,
} from '@skillbridge/jobs';
import { PermanentError } from '@skillbridge/queue';
import type { FetchBoardJob } from '@skillbridge/shared';

export const REFRESH_HOURS = 6;
/** Postings outlive two missed refreshes, so one failing board doesn't empty the list. */
export const POSTING_LIFETIME_HOURS = 3 * REFRESH_HOURS;
/** Between description requests to the same board. */
const PAUSE_MS = 250;
const HOUR = 3_600_000;

interface ScheduleDoc {
  _id: string;
  nextAt: Date;
}

export interface RefresherDeps {
  db: () => Promise<Db>;
  postings: JobPostingCollection;
  boards: JobBoardCollection;
  fetcher?: Fetch;
  now?: () => Date;
  pauseMs?: number;
}

export function createRefresher({ db, postings, boards, fetcher = fetch, now = () => new Date(), pauseMs = PAUSE_MS }: RefresherDeps) {
  const schedule = async () => (await db()).collection<ScheduleDoc>('jobsSchedule');

  return {
    /**
     * True for exactly one caller once the refresh is due, even with several workers:
     * the claim moves the next time forward in a single atomic update.
     */
    async claimRefresh(everyHours = REFRESH_HOURS): Promise<boolean> {
      const c = await schedule();
      const at = now();
      await c.updateOne({ _id: 'refresh' }, { $setOnInsert: { nextAt: new Date(0) } }, { upsert: true });
      const claimed = await c.findOneAndUpdate(
        { _id: 'refresh', nextAt: { $lte: at } },
        { $set: { nextAt: new Date(at.getTime() + everyHours * HOUR) } },
      );
      return claimed !== null;
    },

    /** Reads one board and replaces its postings. Throws to have the queue retry it later. */
    async refreshBoard(job: FetchBoardJob): Promise<{ open: number; kept: number }> {
      if (!isAts(job.ats)) throw new PermanentError(`Unknown job board system "${job.ats}"`);
      const board: Board = { ats: job.ats, slug: job.slug, name: job.name };
      const boardId = `${board.ats}:${board.slug}`;
      const at = now();
      const boardStatus = await boards();

      const result = await fetchBoard(board, fetcher);
      if (result.kind === 'gone') {
        // The company moved or closed its board: stop showing its jobs.
        await (await postings()).deleteMany({ ats: board.ats, slug: board.slug });
        await boardStatus.updateOne(
          { _id: boardId },
          { $set: { name: board.name, status: 'gone', open: 0, kept: 0, error: `HTTP ${result.status}`, checkedAt: at } },
          { upsert: true },
        );
        return { open: 0, kept: 0 };
      }
      if (result.kind === 'error') {
        await boardStatus.updateOne(
          { _id: boardId },
          { $set: { name: board.name, status: 'error', error: result.message, checkedAt: at } },
          { upsert: true },
        );
        throw new Error(`${boardId}: ${result.message}`);
      }

      // Title and place first; descriptions are loaded only for jobs that pass, then checked again.
      const kept: Posting[] = [];
      for (const candidate of result.postings) {
        if (dropReason(candidate, at)) continue;
        let p = candidate;
        if (!p.description) {
          p = await fillDescription(p, fetcher);
          await new Promise((r) => setTimeout(r, pauseMs));
        }
        if (!dropReason(p, at)) kept.push(p);
      }

      const c = await postings();
      const expiresAt = new Date(at.getTime() + POSTING_LIFETIME_HOURS * HOUR);
      for (const p of kept) {
        const skills = skillsIn(p);
        const posted = p.postedAt ? new Date(p.postedAt) : null;
        const fields: Omit<JobPostingDoc, '_id' | 'firstSeenAt'> = {
          ats: p.ats,
          slug: p.slug,
          company: p.company,
          title: p.title,
          location: p.location,
          url: p.url,
          remote: isRemote(p),
          inIndia: inIndia(p),
          experience: experience(p.title, p.description),
          skills,
          roles: rolesFor(p.title, skills),
          fingerprint: fingerprint(p.company, p.title),
          postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : null,
          fetchedAt: at,
          expiresAt,
        };
        await c.updateOne({ _id: p.id }, { $set: fields, $setOnInsert: { firstSeenAt: at } }, { upsert: true });
      }
      // Jobs the board no longer lists (or that no longer pass) are gone.
      await c.deleteMany({ ats: board.ats, slug: board.slug, _id: { $nin: kept.map((p) => p.id) } });

      await boardStatus.updateOne(
        { _id: boardId },
        { $set: { name: board.name, status: 'ok', open: result.postings.length, kept: kept.length, error: null, checkedAt: at } },
        { upsert: true },
      );
      return { open: result.postings.length, kept: kept.length };
    },

    /** Boards last seen gone are skipped until someone re-checks the company list. */
    async boardsToRefresh(all: Board[]): Promise<Board[]> {
      const gone = new Set((await (await boards()).find({ status: 'gone' }, { projection: { _id: 1 } }).toArray()).map((b) => b._id));
      return all.filter((b) => !gone.has(`${b.ats}:${b.slug}`));
    },
  };
}
