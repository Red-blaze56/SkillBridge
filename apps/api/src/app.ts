import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { HealthResponse } from '@skillbridge/shared';
import { currentUser, requireUser } from './auth.ts';

export interface AppOptions {
  /** Sets req.user: devAuth locally, Firebase verification before deployment. */
  authenticate: RequestHandler;
  /** True when the database answers. */
  isDatabaseUp: () => Promise<boolean>;
}

export function createApp({ authenticate, isDatabaseUp }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Public, so the web app and Docker can check the API is alive.
  app.get('/api/health', async (_req, res) => {
    const body: HealthResponse = { status: 'ok', database: (await isDatabaseUp()) ? 'up' : 'down' };
    res.json(body);
  });

  // Everything else under /api needs a signed-in user.
  app.use('/api', authenticate, requireUser);

  app.get('/api/me', (req, res) => {
    res.json(currentUser(req));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  };
  app.use(onError);

  return app;
}
