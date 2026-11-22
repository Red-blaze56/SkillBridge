// /api/jobs/matches against a real MongoDB with seeded postings and analyses.
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lazyAnalyses, lazyJobPostings, type AnalysisDoc, type JobPostingDoc, type Owned } from '@skillbridge/db';
import type { AnalysisResult, AuthUser } from '@skillbridge/shared';
import { createApp } from '../src/app.ts';
import { SESSION_COOKIE } from '../src/auth/http.ts';
import type { AuthService } from '../src/auth/service.ts';
import { lazyResumes } from '../src/resumes.ts';
import { createDailyLimit } from '../src/usage.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
const ORIGIN = 'http://localhost:5173';
const ALICE: AuthUser = { uid: 'alice-id', email: 'alice@example.com' };
const BOB: AuthUser = { uid: 'bob-id', email: 'bob@example.com' };
const NOW = new Date('2026-11-23T10:00:00Z');
const LATER = new Date('2026-11-24T00:00:00Z');

const fakeAuth = {
  userForSession: async (token?: string) => [ALICE, BOB].find((u) => `${u.uid}-token` === token) ?? null,
} as unknown as AuthService;

let client: MongoClient;
let db: Db;
let app: ReturnType<typeof createApp>;
const as = (user: AuthUser) => ({ Cookie: `${SESSION_COOKIE}=${user.uid}-token`, Origin: ORIGIN });
const matches = (query = '', user = ALICE) => request(app).get(`/api/jobs/matches${query}`).set(as(user));

const skill = (skillId: string, name: string, weight: number, level: number) => ({ skillId, name, weight, level, evidence: null, note: null, points: 0 });

function result(levels: Record<string, number>): AnalysisResult {
  return {
    score: 50,
    skills: [
      skill('node', 'Node.js', 3, levels.node ?? 0),
      skill('javascript', 'JavaScript', 3, levels.javascript ?? 0),
      skill('sql', 'SQL databases', 2, levels.sql ?? 0),
      skill('docker', 'Docker', 1, levels.docker ?? 0),
    ],
    gaps: [],
    roleId: 'backend-developer',
    roleVersion: '1.0.0',
    formulaVersion: '1.0.0',
    promptVersion: 'skill-evidence-2',
    model: 'test-model',
  };
}

async function addAnalysis(owner: AuthUser, levels: Record<string, number>, { createdAt = NOW, status = 'done' as AnalysisDoc['status'], roleId = 'backend-developer' } = {}) {
  const doc: Owned<AnalysisDoc> = {
    userId: owner.uid,
    resumeId: new ObjectId(),
    roleId,
    roleVersion: '1.0.0',
    promptVersion: 'skill-evidence-2',
    formulaVersion: '1.0.0',
    model: 'test-model',
    status,
    leaseUntil: null,
    attempts: 1,
    result: status === 'done' ? result(levels) : null,
    error: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt: LATER,
  };
  return (await (await lazyAnalyses(async () => db)()).insertOne(doc)).insertedId.toHexString();
}

async function addPosting(id: string, fields: Partial<JobPostingDoc>) {
  const doc: JobPostingDoc = {
    _id: id,
    ats: 'greenhouse',
    slug: 'acme',
    company: 'Acme',
    title: `Job ${id}`,
    location: 'Pune, India',
    url: `https://jobs.example/${id}`,
    remote: false,
    inIndia: true,
    experience: null,
    skills: [],
    roles: ['backend-developer'],
    fingerprint: `acme|${id}`,
    postedAt: NOW,
    firstSeenAt: NOW,
    fetchedAt: NOW,
    expiresAt: LATER,
    ...fields,
  };
  await (await lazyJobPostings(async () => db)()).insertOne(doc);
}

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  db = client.db(`skillbridge_test_${randomUUID().slice(0, 8)}`);
  app = createApp({
    auth: fakeAuth,
    isDatabaseUp: async () => true,
    appOrigin: ORIGIN,
    secureCookies: false,
    resumes: lazyResumes(async () => db),
    analyses: {
      analyses: lazyAnalyses(async () => db),
      queue: { publish: async () => undefined },
      limit: createDailyLimit(async () => db, { name: 'analyses', perDay: 10 }),
      model: 'test-model',
    },
    jobs: { postings: lazyJobPostings(async () => db), now: () => NOW },
  });
});

afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});

beforeEach(async () => {
  await Promise.all(['analyses', 'jobPostings'].map((c) => db.collection(c).deleteMany({})));
});

describe('GET /api/jobs/matches', () => {
  it('asks for an analysis first', async () => {
    await addPosting('1', { skills: ['node'] });
    await addAnalysis(ALICE, {}, { status: 'running' });
    const res = await matches();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ analysis: null, matches: [], total: 0, updatedAt: NOW.toISOString() });
  });

  it("scores the role's postings against the student's newest analysis, best first", async () => {
    await addAnalysis(ALICE, { node: 0 }, { createdAt: new Date('2026-11-01') });
    const id = await addAnalysis(ALICE, { node: 3, javascript: 1, docker: 2 });
    await addPosting('weak', { skills: ['sql', 'docker'] });
    await addPosting('strong', { skills: ['node', 'javascript', 'react'] });
    await addPosting('none', { skills: ['react'] });
    await addPosting('frontend', { skills: ['node'], roles: ['frontend-developer'] }); // another role
    await addPosting('expired', { skills: ['node'], expiresAt: new Date('2026-11-22') });

    const res = await matches();
    expect(res.status).toBe(200);
    expect(res.body.analysis).toMatchObject({ id, roleId: 'backend-developer', score: 50 });
    expect(res.body.total).toBe(3);
    expect(res.body.matches.map((m: { id: string }) => m.id)).toEqual(['strong', 'weak', 'none']);

    const strong = res.body.matches[0];
    expect(strong.score).toBe(75); // node 3×1 + javascript 3×½ out of 6
    expect(strong.strong.map((s: { skillId: string }) => s.skillId)).toEqual(['node']);
    expect(strong.weak.map((s: { skillId: string }) => s.skillId)).toEqual(['javascript']);
    expect(strong.unchecked).toEqual(['React']);
    expect(res.body.matches[2].score).toBeNull();
  });

  it('shows a job listed twice only once', async () => {
    await addAnalysis(ALICE, { node: 3 });
    await addPosting('pune', { fingerprint: 'acme|sde', skills: ['node'] });
    await addPosting('delhi', { fingerprint: 'acme|sde', skills: ['node'], location: 'Delhi, India' });
    expect((await matches()).body.total).toBe(1);
  });

  it('filters to India or remote jobs', async () => {
    await addAnalysis(ALICE, { node: 3 });
    await addPosting('india', { skills: ['node'] });
    await addPosting('remote', { skills: ['node'], inIndia: false, remote: true, location: 'Remote - Europe' });
    expect((await matches('?where=india')).body.matches.map((m: { id: string }) => m.id)).toEqual(['india']);
    expect((await matches('?where=remote')).body.matches.map((m: { id: string }) => m.id)).toEqual(['remote']);
  });

  it("never uses another student's analysis", async () => {
    const bobs = await addAnalysis(BOB, { node: 3 });
    expect((await matches(`?analysisId=${bobs}`)).status).toBe(404);
    expect((await matches('?analysisId=nope')).status).toBe(404);
    expect((await matches()).body.analysis).toBeNull();
    expect((await matches('', BOB)).body.analysis.id).toBe(bobs);
  });

  it('picks an analysis by role, and needs sign-in', async () => {
    await addAnalysis(ALICE, { node: 3 }, { roleId: 'frontend-developer' });
    expect((await matches('?roleId=backend-developer')).body.analysis).toBeNull();
    expect((await matches('?roleId=frontend-developer')).body.analysis.roleId).toBe('frontend-developer');
    expect((await request(app).get('/api/jobs/matches')).status).toBe(401);
  });
});
