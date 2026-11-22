import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { HealthResponse } from '@skillbridge/shared';
import { authRoutes, currentUser, requireUser, sameOrigin, sessionAuth } from './auth/http.ts';
import type { AuthService } from './auth/service.ts';
import { interviewRoutes, type InterviewServiceOptions } from './interviews.ts';

export interface AppOptions {
  auth: AuthService;
  /** True when the database answers. */
  isDatabaseUp: () => Promise<boolean>;
  /** Where the web app runs, e.g. http://localhost:5173. Only it may send requests that change data. */
  appOrigin: string;
  /** Mark cookies HTTPS-only. True everywhere except local development. */
  secureCookies: boolean;
  /** How many reverse proxies (like Nginx) sit in front, so req.ip is the student's real address. */
  trustProxy?: number;
  /** The mock-interview service. Without it, /api/interviews doesn't exist. */
  interviews?: InterviewServiceOptions;
}

export function createApp({ auth, isDatabaseUp, appOrigin, secureCookies, trustProxy = 0, interviews }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy > 0) app.set('trust proxy', trustProxy);
  app.use(express.json({ limit: '100kb' }));

  // Public, so the web app and Docker can check the API is alive.
  app.get('/api/health', async (_req, res) => {
    const body: HealthResponse = { status: 'ok', database: (await isDatabaseUp()) ? 'up' : 'down' };
    res.json(body);
  });

  app.use('/api', sameOrigin(appOrigin));

  // Sign-in itself is public.
  app.use('/api/auth', authRoutes(auth, { secureCookies }));

  // Everything else under /api needs a signed-in user.
  app.use('/api', sessionAuth(auth), requireUser);

  app.get('/api/me', (req, res) => {
    res.json(currentUser(req));
  });

  if (interviews) app.use('/api/interviews', interviewRoutes(interviews));

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
