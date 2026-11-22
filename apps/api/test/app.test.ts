import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@skillbridge/shared';
import { createApp } from '../src/app.ts';
import { currentUser, readCookie, SESSION_COOKIE } from '../src/auth/http.ts';
import type { AuthService } from '../src/auth/service.ts';

const ORIGIN = 'http://localhost:5173';
const ALICE: AuthUser = { uid: 'alice-id', email: 'alice@example.com' };

/** Only the session lookup matters here. Sign-in itself is tested against MongoDB in auth-flow.test.ts. */
const fakeAuth = {
  userForSession: async (token?: string) => (token === 'good-token' ? ALICE : null),
} as unknown as AuthService;

function app({ databaseUp = true } = {}) {
  return createApp({ auth: fakeAuth, isDatabaseUp: async () => databaseUp, appOrigin: ORIGIN, secureCookies: false });
}

const signedIn = `${SESSION_COOKIE}=good-token`;

describe('GET /api/health', () => {
  it('answers without sign-in and reports the database', async () => {
    const res = await request(app({ databaseUp: false })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'down' });
  });
});

describe('signed-in routes', () => {
  it('return the user the session cookie belongs to', async () => {
    const res = await request(app()).get('/api/me').set('Cookie', signedIn);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ALICE);
  });

  it('reject a request with no session', async () => {
    const res = await request(app()).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in required' });
  });

  it('check sign-in before revealing whether a route exists', async () => {
    expect((await request(app()).get('/api/no-such-route')).status).toBe(401);
    expect((await request(app()).get('/api/no-such-route').set('Cookie', signedIn)).status).toBe(404);
  });
});

describe('requests that change data', () => {
  it('are blocked from another website', async () => {
    const res = await request(app()).post('/api/auth/logout').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('are blocked without an Origin header', async () => {
    expect((await request(app()).post('/api/auth/logout')).status).toBe(403);
  });
});

describe('unknown paths', () => {
  it('answer 404 as JSON', async () => {
    const res = await request(app()).get('/no-such-page');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    const req = { headers: { cookie: `theme=dark; ${SESSION_COOKIE}=abc-123; lang=en` } } as Request;
    expect(readCookie(req, SESSION_COOKIE)).toBe('abc-123');
    expect(readCookie(req, 'missing')).toBeUndefined();
  });
});

describe('currentUser', () => {
  it('fails loudly on a route without requireUser', () => {
    expect(() => currentUser({} as Request)).toThrow(/requireUser/);
  });
});
