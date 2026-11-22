import type { Db } from 'mongodb';

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

/**
 * The auth collections, set up on first use. If MongoDB is down the attempt is
 * forgotten and retried next time, so the API keeps running while it starts.
 */
export function lazyAuthCollections(getDb: () => Promise<Db>): () => Promise<AuthCollections> {
  let ready: Promise<AuthCollections> | undefined;
  return () =>
    (ready ??= (async () => {
      const c = authCollections(await getDb());
      await ensureAuthIndexes(c);
      return c;
    })().catch((error: unknown) => {
      ready = undefined;
      throw error;
    }));
}
