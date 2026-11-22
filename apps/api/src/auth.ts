import type { Request, RequestHandler } from 'express';
import type { AuthUser } from '@skillbridge/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. Read it through currentUser(). */
      user?: AuthUser;
    }
  }
}

/** The only user in local development, until Firebase sign-in replaces devAuth. */
export const DEV_USER: AuthUser = { uid: 'dev-user', email: 'dev@skillbridge.local' };

/**
 * Signs every request in as DEV_USER. It refuses to be created outside development
 * and tests, so a misconfigured server can't run without real sign-in.
 */
export function devAuth(nodeEnv: string): RequestHandler {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`devAuth is not allowed when NODE_ENV is "${nodeEnv}"`);
  }
  return (req, _res, next) => {
    req.user = DEV_USER;
    next();
  };
}

/** Answers 401 unless the authenticate middleware set a user. */
export const requireUser: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
};

/** The signed-in user. Only call it on routes behind requireUser. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error('currentUser() was called on a route without requireUser');
  }
  return req.user;
}
