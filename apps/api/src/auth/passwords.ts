import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

/**
 * One of OWASP's recommended scrypt settings: 32 MiB of memory per hash
 * (N=2^15, r=8, p=3). Slow and memory-hungry on purpose, so stolen hashes
 * are expensive to crack, but light enough for a small server.
 */
export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };

const KEY_BYTES = 32;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, { N, r, p }: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs 128 * N * r bytes; maxmem allows twice that.
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, { N, r, p, maxmem: 256 * N * r }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/**
 * Hashes a password with a fresh random salt. The result records its own cost
 * ("scrypt$N$r$p$salt$hash"), so the cost can be raised later without breaking
 * existing passwords.
 */
export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_COST): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, cost);
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Checks a password against a stored hash in constant time. False for anything malformed. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  const sane =
    scheme === 'scrypt' &&
    Boolean(salt && hash) &&
    Object.values(cost).every(Number.isSafeInteger) &&
    cost.N <= 2 ** 20 &&
    cost.r <= 32 &&
    cost.p <= 16;
  if (!sane) return false;

  const expected = Buffer.from(hash ?? '', 'base64');
  const actual = await derive(password, Buffer.from(salt ?? '', 'base64'), cost);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
