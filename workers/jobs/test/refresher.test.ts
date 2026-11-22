// The refresher against a real MongoDB (a throwaway database) and fake job boards.
import { randomBytes } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lazyJobBoards, lazyJobPostings } from '@skillbridge/db';
import type { Fetch } from '@skillbridge/jobs';
import { createRefresher, POSTING_LIFETIME_HOURS } from '../src/refresher.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
let client: MongoClient;
let db: Db;
const postings = lazyJobPostings(async () => db);
const boards = lazyJobBoards(async () => db);

const NOW = new Date('2026-11-23T06:00:00Z');
const ACME = { ats: 'greenhouse', slug: 'acme', name: 'Acme' };

const greenhouseJob = (id: number, title: string, location: string, content = '<p>Node.js, React and Docker.</p>') => ({
  id,
  title,
  location: { name: location },
  absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  updated_at: '2026-11-20T00:00:00Z',
  content,
});

/** A fake fetch that serves one board's reply (or a status) and counts requests. */
function board(reply: { status?: number; jobs?: unknown[] }) {
  let calls = 0;
  const fetcher: Fetch = async () => {
    calls++;
    return reply.status ? new Response('', { status: reply.status }) : Response.json({ jobs: reply.jobs ?? [] });
  };
  return { fetcher, calls: () => calls };
}

const refresher = (fetcher: Fetch, now = NOW) => createRefresher({ db: async () => db, postings, boards, fetcher, now: () => now, pauseMs: 0 });

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  db = client.db(`skillbridge-test-${randomBytes(4).toString('hex')}`);
});
afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});
beforeEach(async () => {
  await Promise.all(['jobPostings', 'jobBoards', 'jobsSchedule'].map((c) => db.collection(c).deleteMany({})));
});

describe('refreshBoard', () => {
  it('keeps fresher-friendly developer jobs in India or remote, with their skills and roles', async () => {
    const { fetcher } = board({
      jobs: [
        greenhouseJob(1, 'Software Engineer', 'Bengaluru, India'),
        greenhouseJob(2, 'Senior Software Engineer', 'Bengaluru, India'),
        greenhouseJob(3, 'Backend Engineer', 'San Francisco, CA'),
        greenhouseJob(4, 'Backend Engineer', 'Remote'),
      ],
    });
    expect(await refresher(fetcher).refreshBoard(ACME)).toEqual({ open: 4, kept: 2 });

    const saved = await (await postings()).find().sort({ _id: 1 }).toArray();
    expect(saved.map((p) => p._id)).toEqual(['greenhouse:acme:1', 'greenhouse:acme:4']);
    expect(saved[0]).toMatchObject({
      company: 'Acme',
      inIndia: true,
      remote: false,
      skills: ['javascript', 'react', 'node', 'docker'], // "Node.js" names JavaScript too

      roles: ['backend-developer', 'frontend-developer', 'full-stack-developer'],
      firstSeenAt: NOW,
      expiresAt: new Date(NOW.getTime() + POSTING_LIFETIME_HOURS * 3_600_000),
    });
    expect(saved[1]).toMatchObject({ remote: true, roles: ['backend-developer'] });
    expect(await (await boards()).findOne({ _id: 'greenhouse:acme' })).toMatchObject({ status: 'ok', open: 4, kept: 2 });
  });

  it('removes jobs the board no longer lists, and keeps when each was first seen', async () => {
    await refresher(board({ jobs: [greenhouseJob(1, 'Software Engineer', 'Pune'), greenhouseJob(2, 'SDE Intern', 'Pune')] }).fetcher).refreshBoard(ACME);
    const later = new Date(NOW.getTime() + 6 * 3_600_000);
    await refresher(board({ jobs: [greenhouseJob(2, 'SDE Intern', 'Pune')] }).fetcher, later).refreshBoard(ACME);

    const saved = await (await postings()).find().toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ _id: 'greenhouse:acme:2', firstSeenAt: NOW, fetchedAt: later });
  });

  it('drops a board that is gone, and throws on errors so the queue retries', async () => {
    await refresher(board({ jobs: [greenhouseJob(1, 'Software Engineer', 'Pune')] }).fetcher).refreshBoard(ACME);

    await expect(refresher(board({ status: 503 }).fetcher).refreshBoard(ACME)).rejects.toThrow(/greenhouse:acme: HTTP 503/);
    expect(await (await postings()).countDocuments()).toBe(1); // a failing board keeps its jobs for now

    expect(await refresher(board({ status: 404 }).fetcher).refreshBoard(ACME)).toEqual({ open: 0, kept: 0 });
    expect(await (await postings()).countDocuments()).toBe(0);
    expect(await (await boards()).findOne({ _id: 'greenhouse:acme' })).toMatchObject({ status: 'gone' });

    const all = [{ ats: 'greenhouse' as const, slug: 'acme', name: 'Acme' }, { ats: 'lever' as const, slug: 'beta', name: 'Beta' }];
    expect((await refresher(board({}).fetcher).boardsToRefresh(all)).map((b) => b.slug)).toEqual(['beta']);
  });

  it('refuses an unknown board system without retrying', async () => {
    await expect(refresher(board({}).fetcher).refreshBoard({ ats: 'myspace', slug: 'x', name: 'X' })).rejects.toThrow(/Unknown job board/);
  });
});

describe('claimRefresh', () => {
  it('lets exactly one worker start each refresh', async () => {
    const r = refresher(board({}).fetcher);
    const first = await Promise.all([r.claimRefresh(6), r.claimRefresh(6), r.claimRefresh(6)]);
    expect(first.filter(Boolean)).toHaveLength(1);
    expect(await r.claimRefresh(6)).toBe(false);

    const sixHoursLater = refresher(board({}).fetcher, new Date(NOW.getTime() + 6 * 3_600_000));
    expect(await sixHoursLater.claimRefresh(6)).toBe(true);
  });
});
