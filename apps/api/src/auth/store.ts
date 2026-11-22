import type { Db } from 'mongodb';
import { once } from '../db/once.ts';

export interface UserDoc {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface SessionDoc {
  tokenHash: string;
  userId: string;
  email: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

/** A single-use invite or password-reset link. */
export interface LinkDoc {
  tokenHash: string;
  kind: 'invite' | 'reset';
  email: string;
  createdAt: Date;
  expiresAt: Date;
}

/** Failed sign-in count for one email or one IP address, within a time window. */
export interface AttemptDoc {
  key: string;
  count: number;
  expiresAt: Date;
}

export function authCollections(db: Db) {
  return {
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    links: db.collection<LinkDoc>('authLinks'),
    attempts: db.collection<AttemptDoc>('loginAttempts'),
  };
}
export type AuthCollections = ReturnType<typeof authCollections>;

/**
 * Unique keys, plus TTL indexes so MongoDB deletes expired sessions, links and
 * counters by itself (its TTL sweep runs about once a minute, so code still
 * checks expiresAt).
 */
export async function ensureAuthIndexes(c: AuthCollections): Promise<void> {
  const expire = { expireAfterSeconds: 0 };
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    c.sessions.createIndex({ userId: 1 }),
    c.sessions.createIndex({ expiresAt: 1 }, expire),
    c.links.createIndex({ tokenHash: 1 }, { unique: true }),
    c.links.createIndex({ expiresAt: 1 }, expire),
    c.attempts.createIndex({ key: 1 }, { unique: true }),
    c.attempts.createIndex({ expiresAt: 1 }, expire),
  ]);
}

/** The auth collections, with their indexes created on first use. */
export function lazyAuthCollections(getDb: () => Promise<Db>): () => Promise<AuthCollections> {
  return once(async () => {
    const c = authCollections(await getDb());
    await ensureAuthIndexes(c);
    return c;
  });
}
