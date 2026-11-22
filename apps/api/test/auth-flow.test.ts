// Sign-in, end to end, against a real MongoDB. Locally: `docker compose up -d mongo`.
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { SESSION_COOKIE } from '../src/auth/http.ts';
import {
  createAuthService,
  INVITE_LIFETIME_MS,
  LOGIN_LIMITS,
  LOGIN_WINDOW_MS,
  RESET_LIFETIME_MS,
  SESSION_IDLE_MS,
  SESSION_LIFETIME_MS,
} from '../src/auth/service.ts';
import { authCollections, ensureAuthIndexes, type AuthCollections } from '../src/auth/store.ts';
import { hashToken } from '../src/auth/tokens.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
const ORIGIN = 'http://localhost:5173';
const FAST = { N: 2 ** 10, r: 8, p: 1 }; // test-only hashing cost, so the suite stays fast
const EMAIL = 'student@example.com';
const PASSWORD = 'correct horse battery staple';
const HOUR = 60 * 60 * 1000;

let client: MongoClient;
let db: Db;
let c: AuthCollections;
let clock: number; // the auth service's "now"; tests move it forward

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
  } catch (error) {
    throw new Error('These tests need MongoDB. Start it with: docker compose up -d mongo', { cause: error });
  }
  db = client.db(`skillbridge_test_${randomUUID().slice(0, 8)}`);
  c = authCollections(db);
  await ensureAuthIndexes(c);
});

afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});

beforeEach(async () => {
  clock = Date.now();
  await Promise.all([c.users, c.sessions, c.links, c.attempts].map((collection) => collection.deleteMany({})));
});

const auth = createAuthService(async () => c, { cost: FAST, now: () => new Date(clock) });
const app = createApp({ auth, isDatabaseUp: async () => true, appOrigin: ORIGIN, secureCookies: false });

type Agent = ReturnType<typeof request.agent>;

/** A POST from the web app's own pages. */
function post(agent: Agent, path: string, body: object = {}) {
  return agent.post(path).set('Origin', ORIGIN).send(body);
}

/** The session token in a response's Set-Cookie header. */
function sessionToken(res: { headers: Record<string, unknown> }): string {
  const cookies = [res.headers['set-cookie']].flat().join(';');
  const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(cookies)?.[1];
  if (!token) throw new Error('no session cookie in the response');
  return token;
}

/** Invites EMAIL, accepts the invite, and returns the signed-in browser plus its session token. */
async function signUp() {
  const agent = request.agent(app);
  const res = await post(agent, '/api/auth/accept-invite', { token: await auth.createInvite(EMAIL), password: PASSWORD });
  expect(res.status).toBe(200);
  return { agent, token: sessionToken(res) };
}

describe('invite links', () => {
  it('create an account and sign it in', async () => {
    const { agent } = await signUp();
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(EMAIL);
  });

  it('work only once', async () => {
    const token = await auth.createInvite(EMAIL);
    expect((await post(request.agent(app), '/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(200);
    const again = await post(request.agent(app), '/api/auth/accept-invite', { token, password: PASSWORD });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid, used or expired/);
  });

  it('expire after 7 days', async () => {
    const token = await auth.createInvite(EMAIL);
    clock += INVITE_LIFETIME_MS + 1000;
    expect((await post(request.agent(app), '/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(400);
  });

  it('refuse a short password without using up the link', async () => {
    const token = await auth.createInvite(EMAIL);
    const short = await post(request.agent(app), '/api/auth/accept-invite', { token, password: 'too short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('Use at least 12 characters');
    expect((await post(request.agent(app), '/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(200);
  });

  it("can't be made for an email that already has an account", async () => {
    await signUp();
    await expect(auth.createInvite(EMAIL)).rejects.toThrow(/already has an account/);
  });

  it('are stored only as a hash', async () => {
    const token = await auth.createInvite(EMAIL);
    const stored = await c.links.findOne({});
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

describe('signing in', () => {
  it('sets an httpOnly, SameSite session cookie that works', async () => {
    await signUp();
    const agent = request.agent(app);
    const res = await post(agent, '/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = [res.headers['set-cookie']].flat().join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await signUp();
    const wrongPassword = await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: 'not the password' });
    const unknownEmail = await post(request.agent(app), '/api/auth/login', { email: 'nobody@example.com', password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('accepts the email in any case, with spaces around it', async () => {
    await signUp();
    const res = await post(request.agent(app), '/api/auth/login', { email: '  Student@Example.COM ', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('stores only a hash of the session token', async () => {
    const { token } = await signUp();
    const stored = await c.sessions.findOne({});
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('refuses a made-up session cookie', async () => {
    await signUp();
    const res = await request(app).get('/api/me').set('Cookie', `${SESSION_COOKIE}=made-up-token`);
    expect(res.status).toBe(401);
  });

  it(`locks an account after ${LOGIN_LIMITS.email} failures, even for the right password, until the window passes`, async () => {
    await signUp();
    for (let i = 0; i < LOGIN_LIMITS.email; i++) {
      expect((await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: 'wrong password' })).status).toBe(401);
    }
    const locked = await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect(locked.status).toBe(429);

    clock += LOGIN_WINDOW_MS + 1000;
    expect((await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: PASSWORD })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('stop working after signing out, even if the cookie was copied', async () => {
    const { agent, token } = await signUp();
    expect((await post(agent, '/api/auth/logout')).status).toBe(204);
    const res = await request(app).get('/api/me').set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(401);
  });

  it('end after a day without use', async () => {
    const { agent } = await signUp();
    clock += SESSION_IDLE_MS + 1000;
    expect((await agent.get('/api/me')).status).toBe(401);
    expect(await c.sessions.countDocuments()).toBe(0);
  });

  it('end a week after sign-in, even when used every day', async () => {
    const { agent } = await signUp();
    let elapsed = 0;
    while (elapsed + 23 * HOUR < SESSION_LIFETIME_MS) {
      clock += 23 * HOUR;
      elapsed += 23 * HOUR;
      expect((await agent.get('/api/me')).status).toBe(200);
    }
    clock += 23 * HOUR;
    expect((await agent.get('/api/me')).status).toBe(401);
  });
});

describe('password reset links', () => {
  it('set a new password and sign out every other session', async () => {
    const first = await signUp();
    const token = await auth.createReset(EMAIL);
    const second = request.agent(app);
    const NEW_PASSWORD = 'a completely new passphrase';

    expect((await post(second, '/api/auth/reset-password', { token, password: NEW_PASSWORD })).status).toBe(200);
    expect((await first.agent.get('/api/me')).status).toBe(401);
    expect((await second.get('/api/me')).status).toBe(200);
    expect((await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: PASSWORD })).status).toBe(401);
    expect((await post(request.agent(app), '/api/auth/login', { email: EMAIL, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('work only once, and expire after an hour', async () => {
    await signUp();
    const used = await auth.createReset(EMAIL);
    expect((await post(request.agent(app), '/api/auth/reset-password', { token: used, password: PASSWORD })).status).toBe(200);
    expect((await post(request.agent(app), '/api/auth/reset-password', { token: used, password: PASSWORD })).status).toBe(400);

    const late = await auth.createReset(EMAIL);
    clock += RESET_LIFETIME_MS + 1000;
    expect((await post(request.agent(app), '/api/auth/reset-password', { token: late, password: PASSWORD })).status).toBe(400);
  });

  it("can't be made for an email with no account", async () => {
    await expect(auth.createReset('nobody@example.com')).rejects.toThrow(/has no account/);
  });
});
