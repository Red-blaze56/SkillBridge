import { createApp } from './app.ts';
import { createAuthService } from './auth/service.ts';
import { lazyAuthCollections } from './auth/store.ts';
import { createMongo } from './db/mongo.ts';
import { loadEnv } from './env.ts';
import { createDailyLimit } from './usage.ts';

const env = loadEnv(process.env);

const mongo = createMongo(env.MONGODB_URI);
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
    void mongo.close().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
