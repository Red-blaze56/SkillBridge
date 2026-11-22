// /api/roles and /api/analyses against a real MongoDB, with a stand-in job queue.
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lazyAnalyses } from '@skillbridge/db';
import { QueueUnavailableError, type Queue } from '@skillbridge/queue';
import type { AuthUser } from '@skillbridge/shared';
import { createApp } from '../src/app.ts';
import { SESSION_COOKIE } from '../src/auth/http.ts';
import type { AuthService } from '../src/auth/service.ts';
import { lazyResumes } from '../src/resumes.ts';
import { createDailyLimit } from '../src/usage.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
const ORIGIN = 'http://localhost:5173';
const ALICE: AuthUser = { uid: 'alice-id', email: 'alice@example.com' };
const BOB: AuthUser = { uid: 'bob-id', email: 'bob@example.com' };
const PER_DAY = 2;
const RESUME_EXPIRES = new Date('2026-12-20T00:00:00Z');

const fakeAuth = {
  userForSession: async (token?: string) => [ALICE, BOB].find((u) => `${u.uid}-token` === token) ?? null,
} as unknown as AuthService;

/** Records published jobs; set `down` to make publish fail like an unreachable RabbitMQ. */
const queue: Pick<Queue, 'publish'> & { jobs: { job: string; payload: unknown }[]; down: boolean } = {
  jobs: [],
  down: false,
  async publish(job, payload) {
    if (queue.down) throw new QueueUnavailableError();
    queue.jobs.push({ job, payload });
  },
};

let client: MongoClient;
let db: Db;
let app: ReturnType<typeof createApp>;

const as = (user: AuthUser) => ({ Cookie: `${SESSION_COOKIE}=${user.uid}-token`, Origin: ORIGIN });
const start = (body: object, user = ALICE) => request(app).post('/api/analyses').set(as(user)).send(body);

async function addResume({ owner = ALICE, status = 'parsed' }: { owner?: AuthUser; status?: string } = {}) {
  const _id = new ObjectId();
  await db.collection('resumes').insertOne({
    _id,
    userId: owner.uid,
    status,
    fileName: 'asha.pdf',
    passages: [{ id: 1, section: 'experience', page: 1, text: 'Built REST APIs in Node.js' }],
    uploadedAt: new Date(),
    expiresAt: RESUME_EXPIRES,
  });
  return _id.toHexString();
}

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
  } catch (error) {
    throw new Error('These tests need MongoDB. Start it with: docker compose up -d mongo', { cause: error });
  }
  db = client.db(`skillbridge_test_${randomUUID().slice(0, 8)}`);
  app = createApp({
    auth: fakeAuth,
    isDatabaseUp: async () => true,
    appOrigin: ORIGIN,
    secureCookies: false,
    resumes: lazyResumes(async () => db),
    analyses: {
      analyses: lazyAnalyses(async () => db),
      queue,
      limit: createDailyLimit(async () => db, { name: 'analyses', perDay: PER_DAY }),
      model: 'test-model',
    },
  });
});

afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});

beforeEach(async () => {
  await Promise.all(['resumes', 'analyses', 'usageCounters'].map((c) => db.collection(c).deleteMany({})));
  queue.jobs = [];
  queue.down = false;
});

describe('GET /api/roles', () => {
  it('lists the roles and their weighted skills', async () => {
    const res = await request(app).get('/api/roles').set(as(ALICE));
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining(['backend-developer', 'frontend-developer', 'full-stack-developer', 'ai-ml-engineer']),
    );
    const backend = res.body.find((r: { id: string }) => r.id === 'backend-developer');
    expect(backend.skills).toContainEqual({ id: 'node', name: 'Node.js', weight: 3 });
  });

  it('needs sign-in', async () => {
    expect((await request(app).get('/api/roles')).status).toBe(401);
  });
});

describe('POST /api/analyses', () => {
  it('queues an analysis and publishes its job', async () => {
    const resumeId = await addResume();
    const res = await start({ resumeId, roleId: 'backend-developer' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ resumeId, roleId: 'backend-developer', status: 'queued', result: null, error: null });
    expect(queue.jobs).toEqual([{ job: 'analyze', payload: { analysisId: res.body.id } }]);

    const stored = await db.collection('analyses').findOne({ _id: new ObjectId(res.body.id) });
    expect(stored).toMatchObject({ userId: ALICE.uid, model: 'test-model', expiresAt: RESUME_EXPIRES });
  });

  it('reuses a running or finished analysis of the same resume and role', async () => {
    const resumeId = await addResume();
    const first = await start({ resumeId, roleId: 'backend-developer' });
    const again = await start({ resumeId, roleId: 'backend-developer' });

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(queue.jobs).toHaveLength(1);

    // A different role is a new analysis.
    expect((await start({ resumeId, roleId: 'frontend-developer' })).status).toBe(202);
  });

  it('starts a new analysis when the last one failed', async () => {
    const resumeId = await addResume();
    const first = await start({ resumeId, roleId: 'backend-developer' });
    await db.collection('analyses').updateOne({ _id: new ObjectId(first.body.id) }, { $set: { status: 'failed' } });

    const retry = await start({ resumeId, roleId: 'backend-developer' });
    expect(retry.status).toBe(202);
    expect(retry.body.id).not.toBe(first.body.id);
  });

  it("can't analyse another student's resume", async () => {
    const resumeId = await addResume({ owner: ALICE });
    const res = await start({ resumeId, roleId: 'backend-developer' }, BOB);
    expect(res.status).toBe(404);
    expect(queue.jobs).toHaveLength(0);
  });

  it('turns away bad requests, unknown roles and unreadable resumes', async () => {
    expect((await start({ resumeId: 'nope', roleId: 'backend-developer' })).status).toBe(400);
    expect((await start({ resumeId: await addResume(), roleId: 'astronaut' })).status).toBe(400);
    const unreadable = await start({ resumeId: await addResume({ status: 'unreadable' }), roleId: 'backend-developer' });
    expect(unreadable.status).toBe(422);
    expect(queue.jobs).toHaveLength(0);
  });

  it('stops at the daily limit', async () => {
    const resumeId = await addResume();
    expect((await start({ resumeId, roleId: 'backend-developer' })).status).toBe(202);
    expect((await start({ resumeId, roleId: 'frontend-developer' })).status).toBe(202);
    const third = await start({ resumeId, roleId: 'ai-ml-engineer' });
    expect(third.status).toBe(429);
    // A reused result is still fine.
    expect((await start({ resumeId, roleId: 'backend-developer' })).status).toBe(200);
  });

  it("answers 503 and keeps nothing when the queue is down, without using up the day's limit", async () => {
    const resumeId = await addResume();
    queue.down = true;
    const res = await start({ resumeId, roleId: 'backend-developer' });
    expect(res.status).toBe(503);
    expect(await db.collection('analyses').countDocuments()).toBe(0);

    queue.down = false;
    expect((await start({ resumeId, roleId: 'backend-developer' })).status).toBe(202);
    expect((await start({ resumeId, roleId: 'frontend-developer' })).status).toBe(202);
  });

  it('needs the web app origin, like every change', async () => {
    const resumeId = await addResume();
    const res = await request(app)
      .post('/api/analyses')
      .set({ Cookie: `${SESSION_COOKIE}=${ALICE.uid}-token`, Origin: 'https://evil.example' })
      .send({ resumeId, roleId: 'backend-developer' });
    expect(res.status).toBe(403);
  });
});

describe('reading analyses', () => {
  it('shows a student only their own analyses', async () => {
    const resumeId = await addResume();
    const { body } = await start({ resumeId, roleId: 'backend-developer' });

    const mine = await request(app).get(`/api/analyses/${body.id}`).set(as(ALICE));
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ id: body.id, status: 'queued' });

    expect((await request(app).get(`/api/analyses/${body.id}`).set(as(BOB))).status).toBe(404);
    expect((await request(app).get('/api/analyses').set(as(BOB))).body).toEqual([]);
    expect((await request(app).get('/api/analyses/not-an-id').set(as(ALICE))).status).toBe(404);
  });

  it("lists one resume's analyses, newest first", async () => {
    const one = await addResume();
    const two = await addResume();
    const a = await start({ resumeId: one, roleId: 'backend-developer' });
    const b = await start({ resumeId: two, roleId: 'backend-developer' });

    const all = await request(app).get('/api/analyses').set(as(ALICE));
    expect(all.body.map((x: { id: string }) => x.id)).toEqual([b.body.id, a.body.id]);

    const forOne = await request(app).get(`/api/analyses?resumeId=${one}`).set(as(ALICE));
    expect(forOne.body.map((x: { id: string }) => x.id)).toEqual([a.body.id]);
    expect((await request(app).get('/api/analyses?resumeId=bad').set(as(ALICE))).body).toEqual([]);
  });

  it('gives the learning plan for a finished analysis, only to its owner', async () => {
    const resumeId = await addResume();
    const { body } = await start({ resumeId, roleId: 'backend-developer' });
    const roadmap = (user = ALICE) => request(app).get(`/api/analyses/${body.id}/roadmap`).set(as(user));
    expect((await roadmap()).status).toBe(404); // still queued

    const gaps = [
      { skillId: 'node', name: 'Node.js', weight: 3, level: 0, target: 2 },
      { skillId: 'javascript', name: 'JavaScript', weight: 3, level: 1, target: 2 },
    ];
    const result = { score: 20, skills: [], gaps, roleId: 'backend-developer', roleVersion: '1.0.0', formulaVersion: '1.0.0', promptVersion: 'p', model: 'm' };
    await db.collection('analyses').updateOne({ _id: new ObjectId(body.id) }, { $set: { status: 'done', result } });

    const res = await roadmap();
    expect(res.status).toBe(200);
    expect(res.body.steps.map((s: { skillId: string }) => s.skillId)).toEqual(['javascript', 'node']); // foundation first
    expect(res.body).toMatchObject({ analysisId: body.id, roleId: 'backend-developer', totalHours: 42 });
    expect(res.body.steps[0].resources.length).toBeGreaterThan(0);

    expect((await roadmap(BOB)).status).toBe(404);
    expect((await request(app).get('/api/analyses/nope/roadmap').set(as(ALICE))).status).toBe(404);
  });

  it('deletes a resume’s analyses with the resume', async () => {
    const resumeId = await addResume();
    const keep = await addResume();
    await start({ resumeId, roleId: 'backend-developer' });
    await start({ resumeId: keep, roleId: 'backend-developer' });

    expect((await request(app).delete(`/api/resumes/${resumeId}`).set(as(ALICE))).status).toBe(204);
    const left = await db.collection('analyses').find().toArray();
    expect(left.map((d) => d.resumeId.toHexString())).toEqual([keep]);
  });
});
