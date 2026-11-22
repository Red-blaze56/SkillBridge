// The evidence worker: takes analysis jobs from RabbitMQ and runs the evidence agent.
// Start it with `pnpm --filter @skillbridge/worker-evidence dev` (reads the root .env).
import { geminiModel } from '@skillbridge/analysis';
import { createMongo, lazyAnalyses } from '@skillbridge/db';
import { createQueue } from '@skillbridge/queue';
import { ANALYZE_JOB, AnalysisJob } from '@skillbridge/shared';
import { createAnalyzer } from './analyzer.ts';

const env = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/skillbridge?directConnection=true',
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://skillbridge:skillbridge-dev@127.0.0.1:5672',
  apiKey: process.env.GEMINI_API_KEY ?? '',
  model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  concurrency: Number(process.env.EVIDENCE_CONCURRENCY ?? 2),
};

if (!env.apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to the root .env file (see .env.example).');
  process.exit(1);
}

const mongo = createMongo(env.mongoUri);
const analyzer = createAnalyzer({
  analyses: lazyAnalyses(() => mongo.db()),
  db: () => mongo.db(),
  model: geminiModel({ apiKey: env.apiKey, model: env.model }),
  modelName: env.model,
});

const queue = await createQueue({ url: env.rabbitUrl, jobs: [ANALYZE_JOB] });
await queue.consume(ANALYZE_JOB, {
  parse: (body) => AnalysisJob.parse(body),
  handle: (job) => analyzer.handle(job),
  onGiveUp: (job, error) => analyzer.onGiveUp(job, error),
  prefetch: env.concurrency,
});
console.log(`Evidence worker ready: ${env.model}, up to ${env.concurrency} jobs at a time.`);

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: stopping. Unfinished jobs go back to the queue.`);
  await queue.close().catch(() => undefined);
  await mongo.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
