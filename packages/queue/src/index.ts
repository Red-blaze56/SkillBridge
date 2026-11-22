// RabbitMQ jobs for the agent workers: publish a job, consume it, retry it with growing
// delays, and park it in a dead-letter queue when it fails for good.
//
//   publish ─► sb.work (direct) ─► q.<job> ─► worker ── ok ──► ack
//                  ▲                            │
//                  │                            ├─ failed, attempts left ─► sb.retry (headers, by delay)
//                  │                            │      └─► q.retry.<delay> (TTL) ── expires ──┘ back to sb.work
//                  │                            └─ failed for good / bad message ─► sb.dead ─► q.dead.<job>
//
// Messages are persistent and published on confirm channels, so publish() resolves only
// once RabbitMQ has the job. A message is acked only after the handler finished, so a
// crashed worker's job is delivered again: handlers must be safe to run twice.
import { connect, type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib';

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [5_000, 30_000, 300_000];
const ATTEMPT_HEADER = 'sb-attempt';

/** Thrown by a handler when retrying can't help (e.g. the resume was deleted). */
export class PermanentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentError';
  }
}

/** RabbitMQ isn't connected right now, so the job wasn't queued. */
export class QueueUnavailableError extends Error {
  constructor(message = 'The job queue is not reachable right now.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QueueUnavailableError';
  }
}

/** Exchange and queue names. A prefix keeps test runs apart from each other and from dev data. */
export function queueNames(prefix = '') {
  return {
    work: `${prefix}sb.work`,
    retry: `${prefix}sb.retry`,
    dead: `${prefix}sb.dead`,
    queue: (job: string) => `${prefix}q.${job}`,
    retryQueue: (delayMs: number) => `${prefix}q.retry.${delayMs}ms`,
    deadQueue: (job: string) => `${prefix}q.dead.${job}`,
  };
}

export interface QueueConfig {
  url: string;
  /** The jobs this process publishes or consumes. Their queues are created on connect. */
  jobs: readonly string[];
  prefix?: string;
  /** Wait before each retry. The job is tried once more than there are delays. */
  retryDelaysMs?: readonly number[];
  /** Where connection and handler problems are reported. Defaults to console.error. */
  onError?: (error: unknown, context: string) => void;
}

export interface JobContext {
  /** 1 on the first try. */
  attempt: number;
  maxAttempts: number;
}

export interface ConsumeOptions<T> {
  /** Validates the message body; a body that fails goes straight to the dead-letter queue. */
  parse: (body: unknown) => T;
  handle: (payload: T, context: JobContext) => Promise<void>;
  /** Runs once when a job fails for good, before it moves to the dead-letter queue. */
  onGiveUp?: (payload: T, error: unknown) => Promise<void>;
  /** Jobs handled at the same time by this process. Default 1. */
  prefetch?: number;
}

export interface Queue {
  /** Resolves once RabbitMQ has stored the job; throws QueueUnavailableError if it can't. */
  publish(job: string, payload: unknown, options?: { messageId?: string }): Promise<void>;
  /** Starts handling a job's messages, and again after every reconnect. */
  consume<T>(job: string, options: ConsumeOptions<T>): Promise<void>;
  isUp(): boolean;
  close(): Promise<void>;
}

interface Consumer {
  job: string;
  options: ConsumeOptions<unknown>;
}

/**
 * Connects in the background and keeps reconnecting, so the API and workers can start
 * before RabbitMQ does. Until it's connected, publish() throws QueueUnavailableError.
 */
export async function createQueue(config: QueueConfig): Promise<Queue> {
  const names = queueNames(config.prefix);
  const delays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = delays.length + 1;
  const report = config.onError ?? ((error, context) => console.error(`[queue] ${context}:`, error));
  const jobs = new Set(config.jobs);
  const consumers: Consumer[] = [];
  let current: ChannelModel | null = null;
  let publisher: Promise<ConfirmChannel> | null = null;
  let closing = false;

  const known = (job: string) => {
    if (!jobs.has(job)) throw new Error(`Unknown job "${job}": list it in createQueue({ jobs })`);
  };

  async function assertTopology(ch: Channel) {
    await ch.assertExchange(names.work, 'direct', { durable: true });
    await ch.assertExchange(names.retry, 'headers', { durable: true });
    await ch.assertExchange(names.dead, 'direct', { durable: true });
    for (const delay of delays) {
      const q = names.retryQueue(delay);
      // No dead-letter routing key: an expired message keeps its job name as routing key.
      await ch.assertQueue(q, { durable: true, arguments: { 'x-message-ttl': delay, 'x-dead-letter-exchange': names.work } });
      await ch.bindQueue(q, names.retry, '', { 'x-match': 'all', delay: String(delay) });
    }
    for (const job of jobs) {
      await ch.assertQueue(names.queue(job), { durable: true, arguments: { 'x-dead-letter-exchange': names.dead } });
      await ch.bindQueue(names.queue(job), names.work, job);
      await ch.assertQueue(names.deadQueue(job), { durable: true });
      await ch.bindQueue(names.deadQueue(job), names.dead, job);
    }
  }

  /** One confirm channel for publishing, made again if it closes. */
  function confirmChannel(): Promise<ConfirmChannel> {
    const model = current;
    if (!model) return Promise.reject(new QueueUnavailableError());
    if (!publisher) {
      const made = model.createConfirmChannel().then((ch) => {
        ch.on('error', (error: Error) => report(error, 'publish channel'));
        ch.on('close', () => {
          if (publisher === made) publisher = null;
        });
        return ch;
      });
      made.catch(() => {
        if (publisher === made) publisher = null;
      });
      publisher = made;
    }
    return publisher;
  }

  async function send(exchange: string, routingKey: string, content: Buffer, options: Options.Publish) {
    let ch: ConfirmChannel;
    try {
      ch = await confirmChannel();
    } catch (error) {
      throw error instanceof QueueUnavailableError ? error : new QueueUnavailableError(undefined, { cause: error });
    }
    await new Promise<void>((resolve, reject) => {
      try {
        ch.publish(exchange, routingKey, content, { persistent: true, contentType: 'application/json', ...options }, (err) =>
          err ? reject(new QueueUnavailableError('RabbitMQ did not accept the job.', { cause: err })) : resolve(),
        );
      } catch (error) {
        reject(new QueueUnavailableError(undefined, { cause: error })); // the channel closed under us
      }
    });
  }

  async function startConsumer(model: ChannelModel, { job, options }: Consumer) {
    const ch = await model.createChannel();
    ch.on('error', (error: Error) => report(error, `${job} consumer channel`));
    // A channel can close on its own (e.g. a broker-side error). Start a new one while
    // the connection is still the current one; after a reconnect, setup() does it.
    ch.on('close', () => {
      if (!closing && current === model) {
        setTimeout(() => {
          if (!closing && current === model) startConsumer(model, { job, options }).catch((e: unknown) => report(e, `restart ${job} consumer`));
        }, 1000);
      }
    });
    await ch.prefetch(options.prefetch ?? 1);

    const settle = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        report(error, `${job} ack`); // channel gone: RabbitMQ delivers the message again
      }
    };

    await ch.consume(names.queue(job), (message: ConsumeMessage | null) => {
      if (!message) return; // the queue was deleted
      void handleMessage(ch, message);
    });

    async function handleMessage(channel: Channel, message: ConsumeMessage) {
      const headers = message.properties.headers ?? {};
      const attempt = Math.max(1, Number(headers[ATTEMPT_HEADER]) || 1);

      let payload: unknown;
      try {
        payload = options.parse(JSON.parse(message.content.toString('utf8')));
      } catch (error) {
        report(error, `${job}: unreadable message moved to ${names.deadQueue(job)}`);
        settle(() => channel.nack(message, false, false));
        return;
      }

      try {
        await options.handle(payload, { attempt, maxAttempts });
        settle(() => channel.ack(message));
        return;
      } catch (error) {
        const delay = delays[attempt - 1];
        if (!(error instanceof PermanentError) && delay !== undefined) {
          report(error, `${job} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay} ms`);
          try {
            // Drop RabbitMQ's own x- headers (x-death etc.); they're the broker's to set.
            const own = Object.fromEntries(Object.entries(headers).filter(([key]) => !key.startsWith('x-')));
            await send(names.retry, job, message.content, {
              messageId: message.properties.messageId,
              headers: { ...own, [ATTEMPT_HEADER]: attempt + 1, delay: String(delay) },
            });
            settle(() => channel.ack(message));
          } catch (sendError) {
            report(sendError, `${job}: couldn't schedule a retry, putting the message back`);
            settle(() => channel.nack(message, false, true));
          }
          return;
        }
        report(error, `${job} failed for good after attempt ${attempt}`);
        try {
          await options.onGiveUp?.(payload, error);
        } catch (giveUpError) {
          report(giveUpError, `${job} onGiveUp`);
        }
        settle(() => channel.nack(message, false, false));
      }
    }
  }

  const connection = await connect(config.url, {
    recovery: {
      waitForConnect: false,
      initialDelay: 500,
      maxDelay: 15_000,
      async setup(model: ChannelModel) {
        const ch = await model.createChannel();
        await assertTopology(ch);
        await ch.close();
        publisher = null;
        // Set current and snapshot the consumers together, so a consume() call racing
        // with this setup is started exactly once (here or by consume itself).
        current = model;
        for (const consumer of [...consumers]) await startConsumer(model, consumer);
      },
    },
  });
  connection.on('error', (error: Error) => report(error, 'connection'));
  connection.on('connect-failed', (error: Error) => report(error, 'connect'));
  connection.on('disconnect', () => {
    current = null;
    publisher = null;
  });

  return {
    async publish(job, payload, options = {}) {
      known(job);
      await send(names.work, job, Buffer.from(JSON.stringify(payload)), {
        messageId: options.messageId,
        headers: { [ATTEMPT_HEADER]: 1 },
      });
    },
    async consume(job, options) {
      known(job);
      const consumer = { job, options: options as ConsumeOptions<unknown> };
      consumers.push(consumer);
      if (current) await startConsumer(current, consumer);
    },
    isUp: () => current !== null,
    async close() {
      closing = true;
      current = null;
      await connection.close();
    },
  };
}
