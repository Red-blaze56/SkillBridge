import type { Collection, Db } from 'mongodb';

interface CounterDoc {
  key: string;
  count: number;
  expiresAt: Date;
}

/** How often each student may do something per day (UTC), e.g. start a mock interview. */
export interface DailyLimit {
  /** Uses left today. */
  remaining(userId: string): Promise<number>;
  /** Counts one use. */
  record(userId: string): Promise<void>;
}

export interface DailyLimitOptions {
  /** What is counted, e.g. "interviews". */
  name: string;
  perDay: number;
  /** The clock. Tests move it. */
  now?: () => Date;
}

/**
 * Counters in MongoDB, one per student per day. A TTL index deletes each counter
 * after its day ends.
 */
export function createDailyLimit(getDb: () => Promise<Db>, { name, perDay, now = () => new Date() }: DailyLimitOptions): DailyLimit {
  let ready: Promise<Collection<CounterDoc>> | undefined;
  const counters = () =>
    (ready ??= (async () => {
      const c = (await getDb()).collection<CounterDoc>('usageCounters');
      await Promise.all([
        c.createIndex({ key: 1 }, { unique: true }),
        c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      return c;
    })().catch((error: unknown) => {
      ready = undefined; // MongoDB was down: try again next time
      throw error;
    }));

  const keyFor = (userId: string) => `${name}:${userId}:${now().toISOString().slice(0, 10)}`;

  return {
    async remaining(userId) {
      const counter = await (await counters()).findOne({ key: keyFor(userId) });
      return Math.max(0, perDay - (counter?.count ?? 0));
    },
    async record(userId) {
      const at = now();
      const endOfDay = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1));
      await (await counters()).updateOne(
        { key: keyFor(userId) },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: endOfDay } },
        { upsert: true },
      );
    },
  };
}
