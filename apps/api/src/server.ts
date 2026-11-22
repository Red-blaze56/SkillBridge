import { createApp } from './app.ts';
import { devAuth } from './auth.ts';
import { createMongo } from './db/mongo.ts';
import { loadEnv } from './env.ts';

const env = loadEnv(process.env);

// Real sign-in (Firebase) lands before the first deployment. Until then the API only
// runs in development, so it can never be deployed with the test user.
if (env.NODE_ENV !== 'development') {
  console.error(
    `Refusing to start: NODE_ENV is "${env.NODE_ENV}" and production sign-in isn't built yet.\n` +
      'For local development, copy apps/api/.env.example to apps/api/.env.',
  );
  process.exit(1);
}

const mongo = createMongo(env.MONGODB_URI);
const app = createApp({ authenticate: devAuth(env.NODE_ENV), isDatabaseUp: () => mongo.isUp() });

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`Could not listen on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`API listening on http://localhost:${env.PORT}`);
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
