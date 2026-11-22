// /api/interviews against a stand-in interview service that records what it receives.
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '@skillbridge/shared';
import { createApp } from '../src/app.ts';
import { SESSION_COOKIE } from '../src/auth/http.ts';
import type { AuthService } from '../src/auth/service.ts';
import type { DailyLimit } from '../src/usage.ts';

const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-interview-service-token-0123456789';
const ALICE: AuthUser = { uid: 'alice-id', email: 'alice@example.com' };
const ID = '0b9a3c1e-5d2f-4a7b-9c8d-1e2f3a4b5c6d';
const signedIn = `${SESSION_COOKIE}=good-token`;

const fakeAuth = {
  userForSession: async (token?: string) => (token === 'good-token' ? ALICE : null),
} as unknown as AuthService;

// The stand-in interview service.
type Received = { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: unknown };
let received: Received[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

const service = express();
service.use(express.json());
service.use(express.raw({ type: 'multipart/form-data', limit: '11mb' }));
service.use((req, res) => {
  received.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.isBuffer(req.body) ? req.body.length : req.body });
  res.status(reply.status).json(reply.body);
});

let server: Server;
let serviceUrl = '';
beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = service.listen(0, '127.0.0.1', () => resolve(s));
  });
  serviceUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  received = [];
  reply = { status: 200, body: { ok: true } };
});

function memoryLimit(perDay: number): DailyLimit {
  const used = new Map<string, number>();
  return {
    remaining: async (uid) => perDay - (used.get(uid) ?? 0),
    record: async (uid) => void used.set(uid, (used.get(uid) ?? 0) + 1),
  };
}

/** `token: null` means interviews aren't set up (undefined would fall back to the default). */
function app({ token = TOKEN as string | null, url = serviceUrl, perDay = 3 } = {}) {
  return createApp({
    auth: fakeAuth,
    isDatabaseUp: async () => true,
    appOrigin: ORIGIN,
    secureCookies: false,
    interviews: { url, token: token ?? undefined, limit: memoryLimit(perDay) },
  });
}

const start = (target: ReturnType<typeof app>) =>
  request(target).post('/api/interviews').set('Cookie', signedIn).set('Origin', ORIGIN).send({ programming_language: 'python' });

describe('/api/interviews', () => {
  it('forwards with the service token and the signed-in student id', async () => {
    reply = { status: 201, body: { id: ID } };
    const res = await start(app());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: ID });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'POST', path: '/interviews', body: { programming_language: 'python' } });
    expect(received[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(received[0]?.headers['x-user-id']).toBe(ALICE.uid);
  });

  it('never reaches the service without sign-in', async () => {
    expect((await request(app()).get('/api/interviews')).status).toBe(401);
    expect(received).toHaveLength(0);
  });

  it('stops at the daily limit', async () => {
    reply = { status: 201, body: { id: ID } };
    const target = app({ perDay: 2 });
    expect((await start(target)).status).toBe(201);
    expect((await start(target)).status).toBe(201);
    const third = await start(target);
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/today's mock interviews/);
    expect(received).toHaveLength(2);
  });

  it("doesn't count an interview that failed to start", async () => {
    const target = app({ perDay: 1 });
    reply = { status: 503, body: { detail: 'Out of quota' } };
    expect((await start(target)).status).toBe(503);
    reply = { status: 201, body: { id: ID } };
    expect((await start(target)).status).toBe(201);
  });

  it("passes on the service's error message", async () => {
    reply = { status: 503, body: { detail: "Out of quota for 'gemini-2.5-flash'." } };
    const res = await request(app())
      .post(`/api/interviews/${ID}/answer`)
      .set('Cookie', signedIn)
      .set('Origin', ORIGIN)
      .send({ content: 'my answer' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Out of quota for 'gemini-2.5-flash'." });
    expect(received[0]).toMatchObject({ method: 'POST', path: `/interviews/${ID}/answer`, body: { content: 'my answer' } });
  });

  it("doesn't blame the student when the service refuses our token", async () => {
    reply = { status: 401, body: { detail: 'Unknown caller' } };
    const res = await request(app()).get(`/api/interviews/${ID}`).set('Cookie', signedIn);
    expect(res.status).toBe(502);
  });

  it('refuses malformed interview ids without calling the service', async () => {
    expect((await request(app()).get('/api/interviews/not-an-id').set('Cookie', signedIn)).status).toBe(404);
    const sneaky = await request(app()).post('/api/interviews/..%2F..%2Fhealth/answer').set('Cookie', signedIn).set('Origin', ORIGIN);
    expect(sneaky.status).toBe(404);
    expect(received).toHaveLength(0);
  });

  it('passes on only the paging parameters', async () => {
    await request(app()).get('/api/interviews?limit=5&cursor=abc&admin=true').set('Cookie', signedIn);
    expect(received[0]?.path).toBe('/interviews?limit=5&cursor=abc');
  });

  it('streams a resume upload through', async () => {
    const res = await request(app())
      .post('/api/interviews/parse-resume')
      .set('Cookie', signedIn)
      .set('Origin', ORIGIN)
      .attach('file', Buffer.from('%PDF-1.4 a small test file'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(String(received[0]?.headers['content-type'])).toMatch(/^multipart\/form-data/);
    expect(received[0]?.body).toBeGreaterThan(0);
  });

  it('says so when the service is down', async () => {
    const res = await start(app({ url: 'http://127.0.0.1:1' }));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not reachable/);
  });

  it('says so when interviews are not set up', async () => {
    const res = await start(app({ token: null }));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not set up/);
  });
});
