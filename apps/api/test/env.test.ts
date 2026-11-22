import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.ts';

describe('loadEnv', () => {
  it('treats a missing NODE_ENV as production', () => {
    expect(loadEnv({}).NODE_ENV).toBe('production');
  });

  it('reads development settings', () => {
    expect(loadEnv({ NODE_ENV: 'development', PORT: '4100' })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4100,
    });
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Invalid environment/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment/);
  });
});
