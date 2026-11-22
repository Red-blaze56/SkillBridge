// Runs against a real RabbitMQ (docker compose up rabbitmq; CI starts one too). Each run
// uses its own name prefix and short retry delays, and deletes what it made.
import { randomBytes } from 'node:crypto';
import { connect, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueue, PermanentError, queueNames, QueueUnavailableError, type Queue } from '../src/index.ts';

const URL = process.env.RABBITMQ_URL ?? 'amqp://skillbridge:skillbridge-dev@127.0.0.1:5672';
const DELAYS = [100, 300];
const prefix = `test-${randomBytes(4).toString('hex')}.`;
const names = queueNames(prefix);
const JOBS = ['ok', 'flaky', 'broken', 'permanent', 'strict'];

interface Job {
  n: number;
}
const parse = (body: unknown): Job => {
  if (typeof (body as Job | null)?.n !== 'number') throw new Error('n must be a number');
  return body as Job;
};

let queue: Queue;
let admin: ChannelModel;
const errors: string[] = [];

/** Resolves when check() passes, polling every 20 ms for up to 4 s. */
async function eventually(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 4000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Takes every message out of a job's dead-letter queue. */
async function deadMessages(job: string): Promise<unknown[]> {
  const ch = await admin.createChannel();
  const found: unknown[] = [];
  for (let m = await ch.get(names.deadQueue(job), { noAck: true }); m; m = await ch.get(names.deadQueue(job), { noAck: true })) {
    found.push(JSON.parse(m.content.toString('utf8')));
  }
  await ch.close();
  return found;
}

beforeAll(async () => {
  admin = await connect(URL);
  queue = await createQueue({
    url: URL,
    jobs: JOBS,
    prefix,
    retryDelaysMs: DELAYS,
    onError: (_error, context) => errors.push(context),
  });
  await eventually(() => queue.isUp());
});

afterAll(async () => {
  await queue?.close();
  if (!admin) return;
  const ch = await admin.createChannel();
  for (const job of JOBS) {
    await ch.deleteQueue(names.queue(job));
    await ch.deleteQueue(names.deadQueue(job));
  }
  for (const delay of DELAYS) await ch.deleteQueue(names.retryQueue(delay));
  for (const exchange of [names.work, names.retry, names.dead]) await ch.deleteExchange(exchange);
  await admin.close();
});

describe('the job queue', () => {
  it('delivers a published job to its consumer', async () => {
    const seen: { n: number; attempt: number }[] = [];
    await queue.consume('ok', {
      parse,
      handle: async (job, { attempt }) => void seen.push({ n: job.n, attempt }),
    });
    await queue.publish('ok', { n: 1 });
    await eventually(() => seen.length === 1);
    expect(seen).toEqual([{ n: 1, attempt: 1 }]);
  });

  it('retries a failing job after each delay until it succeeds', async () => {
    const tries: { attempt: number; at: number }[] = [];
    const start = Date.now();
    await queue.consume('flaky', {
      parse,
      handle: async (_job, { attempt }) => {
        tries.push({ attempt, at: Date.now() - start });
        if (attempt < 3) throw new Error('Gemini is busy');
      },
    });
    await queue.publish('flaky', { n: 2 });
    await eventually(() => tries.length === 3);

    expect(tries.map((t) => t.attempt)).toEqual([1, 2, 3]);
    expect(tries[1]!.at - tries[0]!.at).toBeGreaterThanOrEqual(DELAYS[0]! - 20);
    expect(tries[2]!.at - tries[1]!.at).toBeGreaterThanOrEqual(DELAYS[1]! - 20);
    expect(await deadMessages('flaky')).toEqual([]);
  });

  it('gives up after the last attempt, calls onGiveUp once and parks the job', async () => {
    let tries = 0;
    const gaveUp: unknown[] = [];
    await queue.consume('broken', {
      parse,
      handle: async () => {
        tries++;
        throw new Error('always fails');
      },
      onGiveUp: async (job, error) => void gaveUp.push({ job, message: (error as Error).message }),
    });
    await queue.publish('broken', { n: 3 });
    await eventually(() => gaveUp.length === 1);

    expect(tries).toBe(DELAYS.length + 1);
    expect(gaveUp).toEqual([{ job: { n: 3 }, message: 'always fails' }]);
    const dead: unknown[] = [];
    await eventually(async () => dead.push(...(await deadMessages('broken'))) > 0);
    expect(dead).toEqual([{ n: 3 }]);
  });

  it('does not retry a PermanentError', async () => {
    let tries = 0;
    let gaveUp = 0;
    await queue.consume('permanent', {
      parse,
      handle: async () => {
        tries++;
        throw new PermanentError('the resume was deleted');
      },
      onGiveUp: async () => void gaveUp++,
    });
    await queue.publish('permanent', { n: 4 });
    await eventually(() => gaveUp === 1);
    await new Promise((r) => setTimeout(r, DELAYS[0]! * 2)); // no retry arrives
    expect(tries).toBe(1);
  });

  it('moves a message that fails validation straight to the dead-letter queue', async () => {
    let handled = 0;
    await queue.consume('strict', { parse, handle: async () => void handled++ });
    await queue.publish('strict', { n: 'not a number' });

    const dead: unknown[] = [];
    await eventually(async () => dead.push(...(await deadMessages('strict'))) > 0);
    expect(dead).toEqual([{ n: 'not a number' }]);
    expect(handled).toBe(0);
  });

  it('refuses unknown jobs', async () => {
    await expect(queue.publish('nope', {})).rejects.toThrow(/Unknown job "nope"/);
  });
});

describe('without RabbitMQ', () => {
  it('fails publish() at once with QueueUnavailableError', async () => {
    const offline = await createQueue({ url: 'amqp://127.0.0.1:1', jobs: ['ok'], onError: () => {} });
    try {
      expect(offline.isUp()).toBe(false);
      await expect(offline.publish('ok', { n: 1 })).rejects.toBeInstanceOf(QueueUnavailableError);
    } finally {
      await offline.close();
    }
  });
});
