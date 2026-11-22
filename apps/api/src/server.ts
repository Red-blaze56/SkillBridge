import { createApp } from './app.ts';
import { createAuthService } from './auth/service.ts';
import { lazyAuthCollections } from './auth/store.ts';
import { createMongo, lazyAnalyses } from '@skillbridge/db';
import { createQueue } from '@skillbridge/queue';
import { ANALYZE_JOB } from '@skillbridge/shared';
import { loadEnv } from './env.ts';
import { lazyResumes } from './resumes.ts';
import { createDailyLimit } from './usage.ts';

const env = loadEnv(process.env);

const mongo = createMongo(env.MONGODB_URI);
// Connects in the background; until RabbitMQ is up, starting an analysis answers 503.
const queue = await createQueue({ url: env.RABBITMQ_URL, jobs: [ANALYZE_JOB] });
const auth = createAuthService(lazyAuthCollections(() => mongo.db()));
const app = createApp({
  auth,
  isDatabaseUp: () => mongo.isUp(),
  appOrigin: env.APP_ORIGIN,
  secureCookies: env.NODE_ENV !== 'development',
  trustProxy: env.TRUST_PROXY,
  interviews: {
    url: env.INTERVIEW_SERVICE_URL,
    token: env.INTERVIEW_SERVICE_TOKEN,
    limit: createDailyLimit(() => mongo.db(), { name: 'interviews', perDay: env.INTERVIEWS_PER_DAY }),
  },
  resumes: lazyResumes(() => mongo.db()),
  analyses: {
    analyses: lazyAnalyses(() => mongo.db()),
    queue,
    limit: createDailyLimit(() => mongo.db(), { name: 'analyses', perDay: env.ANALYSES_PER_DAY }),
    model: env.GEMINI_MODEL,
  },
});

if (!env.INTERVIEW_SERVICE_TOKEN) {
  console.warn('Mock interviews are off: set INTERVIEW_SERVICE_TOKEN in the root .env (see .env.example).');
}

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`Could not listen on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Says so up front instead of on the first request. The URI isn't printed: it can hold a password.
void mongo.isUp().then((up) => {
  if (!up) console.warn('MongoDB is not reachable yet. Start it with: docker compose up -d mongo');
});

function shutdown() {
  server.close(() => {
    void Promise.allSettled([queue.close(), mongo.close()]).finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
