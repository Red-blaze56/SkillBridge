import { describe, expect, it } from 'vitest';
import { DEFAULT_COST, hashPassword, verifyPassword } from '../src/auth/passwords.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 }; // test-only cost, so the suite stays fast

describe('passwords', () => {
  it('verify the right password and reject a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple', FAST);
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('correct horse battery stapler', stored)).toBe(false);
  });

  it('get a new random salt every time, so equal passwords hash differently', async () => {
    const a = await hashPassword('same password here', FAST);
    const b = await hashPassword('same password here', FAST);
    expect(a).not.toBe(b);
  });

  it('record their cost in the hash, using the default OWASP setting', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith(`scrypt$${DEFAULT_COST.N}$${DEFAULT_COST.r}$${DEFAULT_COST.p}$`)).toBe(true);
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('treat two Unicode spellings of the same text as equal', async () => {
    const composed = 'café password 1'; // é as one character
    const decomposed = 'café password 1'; // e plus a combining accent
    expect(await verifyPassword(decomposed, await hashPassword(composed, FAST))).toBe(true);
  });

  it('reject malformed or tampered hashes', async () => {
    const stored = await hashPassword('correct horse battery staple', FAST);
    const parts = stored.split('$');
    const tamperedHash = [...parts.slice(0, 5), Buffer.alloc(32, 1).toString('base64')].join('$');
    expect(await verifyPassword('correct horse battery staple', tamperedHash)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPassword('anything', `scrypt$${2 ** 30}$8$1$c2FsdA==$aGFzaA==`)).toBe(false);
  });
});
