import { MongoServerError } from 'mongodb';
import type { AuthUser } from '@skillbridge/shared';
import { DEFAULT_COST, hashPassword, verifyPassword, type ScryptCost } from './passwords.ts';
import type { AuthCollections } from './store.ts';
import { hashToken, newToken } from './tokens.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A session ends a week after sign-in, or after a day without use, whichever comes first. */
export const SESSION_LIFETIME_MS = 7 * DAY;
export const SESSION_IDLE_MS = DAY;
const LAST_SEEN_PRECISION_MS = 5 * MINUTE; // saves a database write on most requests

export const INVITE_LIFETIME_MS = 7 * DAY;
export const RESET_LIFETIME_MS = HOUR;

/** Failed sign-ins allowed per window, per email and per IP address. */
export const LOGIN_WINDOW_MS = 15 * MINUTE;
export const LOGIN_LIMITS = { email: 5, ip: 20 };

export class TooManyAttempts extends Error {}

/** A signed-in user plus the session token to put in their cookie. */
export interface SignedIn {
  user: AuthUser;
  token: string;
}

export interface AuthServiceOptions {
  /** Password hashing cost. Only tests lower it. */
  cost?: ScryptCost;
  /** The clock. Tests move it to check expiry. */
  now?: () => Date;
}

export function createAuthService(
  collections: () => Promise<AuthCollections>,
  { cost = DEFAULT_COST, now = () => new Date() }: AuthServiceOptions = {},
) {
  const later = (ms: number) => new Date(now().getTime() + ms);

  // Checked when an email has no account, so a wrong email takes as long as a
  // wrong password and response times don't reveal who has an account.
  let dummyHash: Promise<string> | undefined;
  const dummy = () => (dummyHash ??= hashPassword(newToken(), cost));

  async function startSession(user: AuthUser): Promise<SignedIn> {
    const c = await collections();
    const token = newToken();
    const at = now();
    await c.sessions.insertOne({
      tokenHash: hashToken(token),
      userId: user.uid,
      email: user.email,
      createdAt: at,
      lastSeenAt: at,
      expiresAt: later(SESSION_LIFETIME_MS),
    });
    return { user, token };
  }

  /** Consumes a link: the atomic find-and-delete is what makes it single-use. */
  async function useLink(token: string, kind: 'invite' | 'reset') {
    const c = await collections();
    return c.links.findOneAndDelete({ tokenHash: hashToken(token), kind, expiresAt: { $gt: now() } });
  }

  async function createLink(email: string, kind: 'invite' | 'reset', lifetimeMs: number): Promise<string> {
    const c = await collections();
    const token = newToken();
    await c.links.insertOne({
      tokenHash: hashToken(token),
      kind,
      email,
      createdAt: now(),
      expiresAt: later(lifetimeMs),
    });
    return token;
  }

  async function checkLimits(keys: { email: string; ip: string }) {
    const c = await collections();
    const counters = await c.attempts
      .find({ key: { $in: [keys.email, keys.ip] }, expiresAt: { $gt: now() } })
      .toArray();
    for (const { key, count } of counters) {
      const limit = key === keys.email ? LOGIN_LIMITS.email : LOGIN_LIMITS.ip;
      if (count >= limit) throw new TooManyAttempts();
    }
  }

  async function countFailure(keys: { email: string; ip: string }) {
    const c = await collections();
    for (const key of [keys.email, keys.ip]) {
      await c.attempts.deleteOne({ key, expiresAt: { $lte: now() } }); // a finished window starts over
      await c.attempts.updateOne(
        { key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: later(LOGIN_WINDOW_MS) } },
        { upsert: true },
      );
    }
  }

  return {
    /** The user a session cookie belongs to, or null if it's missing, unknown or expired. */
    async userForSession(token: string | undefined): Promise<AuthUser | null> {
      if (!token) return null;
      const c = await collections();
      const tokenHash = hashToken(token);
      const session = await c.sessions.findOne({ tokenHash, expiresAt: { $gt: now() } });
      if (!session) return null;

      const idleFor = now().getTime() - session.lastSeenAt.getTime();
      if (idleFor > SESSION_IDLE_MS) {
        await c.sessions.deleteOne({ tokenHash });
        return null;
      }
      if (idleFor > LAST_SEEN_PRECISION_MS) {
        await c.sessions.updateOne({ tokenHash }, { $set: { lastSeenAt: now() } });
      }
      return { uid: session.userId, email: session.email };
    },

    async login(email: string, password: string, ip: string): Promise<SignedIn | null> {
      const keys = { email: `email:${email}`, ip: `ip:${ip}` };
      await checkLimits(keys);
      const c = await collections();

      const user = await c.users.findOne({ email });
      const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, await dummy());
      if (!user || !ok) {
        await countFailure(keys);
        return null;
      }
      await c.attempts.deleteOne({ key: keys.email });
      return startSession({ uid: user._id.toHexString(), email: user.email });
    },

    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      const c = await collections();
      await c.sessions.deleteOne({ tokenHash: hashToken(token) });
    },

    /** Admin only: a link that lets `email` create an account. */
    async createInvite(email: string): Promise<string> {
      const c = await collections();
      if (await c.users.findOne({ email })) throw new Error(`${email} already has an account`);
      return createLink(email, 'invite', INVITE_LIFETIME_MS);
    },

    /** Admin only: a link that lets `email` choose a new password. */
    async createReset(email: string): Promise<string> {
      const c = await collections();
      if (!(await c.users.findOne({ email }))) throw new Error(`${email} has no account`);
      return createLink(email, 'reset', RESET_LIFETIME_MS);
    },

    /** Creates the invited account and signs it in. Null if the link is invalid, used or expired. */
    async acceptInvite(token: string, password: string): Promise<SignedIn | null> {
      // The link is used up before the (deliberately slow) hashing, so random
      // tokens can't be used to make the server hash for free.
      const invite = await useLink(token, 'invite');
      if (!invite) return null;
      const c = await collections();
      try {
        const passwordHash = await hashPassword(password, cost);
        const { insertedId } = await c.users.insertOne({ email: invite.email, passwordHash, createdAt: now() });
        return startSession({ uid: insertedId.toHexString(), email: invite.email });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return null; // account already exists
        throw error;
      }
    },

    /** Sets a new password, signs out every existing session, and signs this one in. */
    async resetPassword(token: string, password: string): Promise<SignedIn | null> {
      const reset = await useLink(token, 'reset');
      if (!reset) return null;
      const c = await collections();
      const user = await c.users.findOne({ email: reset.email });
      if (!user) return null;

      const passwordHash = await hashPassword(password, cost);
      const uid = user._id.toHexString();
      await c.users.updateOne({ _id: user._id }, { $set: { passwordHash } });
      await c.sessions.deleteMany({ userId: uid });
      await c.attempts.deleteOne({ key: `email:${user.email}` });
      return startSession({ uid, email: user.email });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
