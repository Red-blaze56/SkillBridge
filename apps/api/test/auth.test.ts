import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { currentUser, devAuth } from '../src/auth.ts';

describe('devAuth', () => {
  it('refuses to exist in production', () => {
    expect(() => devAuth('production')).toThrow(/not allowed/);
  });

  it('refuses an environment it does not know', () => {
    expect(() => devAuth('staging')).toThrow(/not allowed/);
  });

  it('is allowed in development and tests', () => {
    expect(() => devAuth('development')).not.toThrow();
    expect(() => devAuth('test')).not.toThrow();
  });
});

describe('currentUser', () => {
  it('fails loudly on a route without requireUser', () => {
    expect(() => currentUser({} as Request)).toThrow(/requireUser/);
  });
});
