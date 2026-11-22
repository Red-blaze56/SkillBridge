import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { DEV_USER, devAuth } from '../src/auth.ts';

/** An authenticate middleware that signs nobody in. */
const nobody: RequestHandler = (_req, _res, next) => next();

function app({ authenticate = devAuth('test'), databaseUp = true } = {}) {
  return createApp({ authenticate, isDatabaseUp: async () => databaseUp });
}

describe('GET /api/health', () => {
  it('answers without sign-in and reports the database', async () => {
    const res = await request(app({ authenticate: nobody, databaseUp: false })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'down' });
  });
});

describe('signed-in routes', () => {
  it('return the signed-in user', async () => {
    const res = await request(app()).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEV_USER);
  });

  it('reject a request with no user', async () => {
    const res = await request(app({ authenticate: nobody })).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in required' });
  });

  it('check sign-in before revealing whether a route exists', async () => {
    const res = await request(app({ authenticate: nobody })).get('/api/no-such-route');
    expect(res.status).toBe(401);
  });
});

describe('unknown paths', () => {
  it('answer 404 as JSON', async () => {
    const res = await request(app()).get('/no-such-page');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
