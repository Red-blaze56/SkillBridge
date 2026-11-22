// Daily limits against a real MongoDB. Locally: `docker compose up -d mongo`.
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDailyLimit } from '../src/usage.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
const DAY = 24 * 60 * 60 * 1000;

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  try {
    await client.connect();
  } catch (error) {
    throw new Error('These tests need MongoDB. Start it with: docker compose up -d mongo', { cause: error });
  }
  db = client.db(`skillbridge_test_${randomUUID().slice(0, 8)}`);
});

afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});

describe('daily limits', () => {
  it('count per student and start again the next day', async () => {
    let clock = Date.UTC(2026, 10, 23, 10, 0);
    const limit = createDailyLimit(async () => db, { name: 'interviews', perDay: 2, now: () => new Date(clock) });

    expect(await limit.remaining('alice')).toBe(2);
    await limit.record('alice');
    await limit.record('alice');
    expect(await limit.remaining('alice')).toBe(0);
    expect(await limit.remaining('bob')).toBe(2);

    clock += DAY;
    expect(await limit.remaining('alice')).toBe(2);
  });

  it('let MongoDB delete each counter when its day ends', async () => {
    const limit = createDailyLimit(async () => db, {
      name: 'expiry-check',
      perDay: 1,
      now: () => new Date(Date.UTC(2026, 10, 23, 22, 30)),
    });
    await limit.record('alice');
    const counter = await db.collection('usageCounters').findOne({ key: 'expiry-check:alice:2026-11-23' });
    expect(counter?.expiresAt).toEqual(new Date(Date.UTC(2026, 10, 24)));
  });
});
