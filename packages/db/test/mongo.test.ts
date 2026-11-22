import { describe, expect, it } from 'vitest';
import { createMongo } from '../src/mongo.ts';

/** A stand-in MongoClient whose connect() fails or succeeds as told. */
function fakeClient(connects: boolean) {
  const client = {
    closed: false,
    connect: async () => {
      if (!connects) throw new Error('connection refused');
      return client;
    },
    close: async () => {
      client.closed = true;
    },
    db: () => ({ command: async () => ({ ok: 1 }) }),
  };
  return client;
}

describe('createMongo', () => {
  it('recovers when MongoDB starts after the API', async () => {
    const clients = [fakeClient(false), fakeClient(true)];
    let made = 0;
    const mongo = createMongo('mongodb://example', () => clients[made++] as never);

    expect(await mongo.isUp()).toBe(false);
    expect(clients[0]?.closed).toBe(true); // the failed client is thrown away
    expect(await mongo.isUp()).toBe(true);
    expect(made).toBe(2);
  });

  it('keeps using one client once connected', async () => {
    let made = 0;
    const mongo = createMongo('mongodb://example', () => {
      made++;
      return fakeClient(true) as never;
    });

    expect(await mongo.isUp()).toBe(true);
    expect(await mongo.isUp()).toBe(true);
    expect(made).toBe(1);
  });
});
