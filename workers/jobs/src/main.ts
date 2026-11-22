// The jobs worker: every few hours, reads the company job boards through RabbitMQ and
// keeps the shared list of fresher-friendly developer jobs fresh.
// Start it with `pnpm jobs-worker` (reads the root .env).
import { createMongo, lazyJobBoards, lazyJobPostings } from '@skillbridge/db';
import { loadCompanies } from '@skillbridge/jobs/companies';
import { createQueue } from '@skillbridge/queue';
import { FETCH_BOARD_JOB, FetchBoardJob } from '@skillbridge/shared';
import { createRefresher, REFRESH_HOURS } from './refresher.ts';

const env = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/skillbridge?directConnection=true',
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://skillbridge:skillbridge-dev@127.0.0.1:5672',
  refreshHours: Number(process.env.JOBS_REFRESH_HOURS ?? REFRESH_HOURS),
  concurrency: Number(process.env.JOBS_CONCURRENCY ?? 2),
};

const mongo = createMongo(env.mongoUri);
const refresher = createRefresher({
  db: () => mongo.db(),
  postings: lazyJobPostings(() => mongo.db()),
  boards: lazyJobBoards(() => mongo.db()),
});
const companies = loadCompanies();

const queue = await createQueue({ url: env.rabbitUrl, jobs: [FETCH_BOARD_JOB] });
await queue.consume(FETCH_BOARD_JOB, {
  parse: (body) => FetchBoardJob.parse(body),
  handle: async (job) => {
    const { open, kept } = await refresher.refreshBoard(job);
    if (kept > 0) console.log(`${job.name}: kept ${kept} of ${open} jobs`);
  },
  onGiveUp: async (job, error) => console.warn(`${job.name}: skipped this round (${error instanceof Error ? error.message : error})`),
  prefetch: env.concurrency,
});

/** Queues every live board when the refresh is due. Checked often; claimed by one worker only. */
async function maybeRefresh() {
  try {
    if (!queue.isUp() || !(await refresher.claimRefresh(env.refreshHours))) return;
    const boards = await refresher.boardsToRefresh(companies);
    for (const b of boards) await queue.publish(FETCH_BOARD_JOB, { ats: b.ats, slug: b.slug, name: b.name });
    console.log(`Refreshing ${boards.length} job boards.`);
  } catch (error) {
    console.error('Could not start a refresh:', error instanceof Error ? error.message : error);
  }
}

const timer = setInterval(() => void maybeRefresh(), 60_000);
setTimeout(() => void maybeRefresh(), 3_000); // once RabbitMQ is likely connected
console.log(`Jobs worker ready: ${companies.length} boards, refreshed every ${env.refreshHours} h.`);

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: stopping.`);
  clearInterval(timer);
  await queue.close().catch(() => undefined);
  await mongo.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
