import express from 'express';
import type { Request, RequestHandler, Response } from 'express';
import { LoginRequest, SetPasswordRequest, type AuthUser } from '@skillbridge/shared';
import { SESSION_LIFETIME_MS, TooManyAttempts, type AuthService, type SignedIn } from './service.ts';

declare global {
  namespace Express {
    interface Request {
      /** Set by sessionAuth. Read it through currentUser(). */
      user?: AuthUser;
    }
  }
}

export const SESSION_COOKIE = 'sb_session';

/** One cookie's value from the Cookie header. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

/**
 * httpOnly: page scripts can't read it. SameSite=Lax: other sites can't send it
 * with their own requests. Secure (HTTPS only) everywhere except local development.
 */
function cookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const;
}

/** Sets req.user when the request carries a valid session cookie. */
export function sessionAuth(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const user = await auth.userForSession(readCookie(req, SESSION_COOKIE));
    if (user) req.user = user;
    next();
  };
}

/** Answers 401 unless sessionAuth found a user. */
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

/**
 * Requests that change data must come from the app's own pages. This blocks
 * cross-site request forgery: another website making a student's browser send
 * requests that ride on their session cookie.
 */
export function sameOrigin(appOrigin: string): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    if (req.get('origin') !== appOrigin) {
      res.status(403).json({ error: 'Request blocked: it did not come from SkillBridge' });
      return;
    }
    next();
  };
}

/** POST /login, /logout, /accept-invite and /reset-password, mounted at /api/auth. */
export function authRoutes(auth: AuthService, { secureCookies }: { secureCookies: boolean }) {
  const router = express.Router();

  const signIn = (res: Response, { user, token }: SignedIn) => {
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(secureCookies), maxAge: SESSION_LIFETIME_MS });
    res.json(user);
  };

  router.post('/login', async (req, res) => {
    const body = LoginRequest.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Enter your email and password' });
      return;
    }
    try {
      const result = await auth.login(body.data.email, body.data.password, req.ip ?? 'unknown');
      if (!result) {
        // The same answer for an unknown email and a wrong password.
        res.status(401).json({ error: 'Email or password is incorrect' });
        return;
      }
      signIn(res, result);
    } catch (error) {
      if (!(error instanceof TooManyAttempts)) throw error;
      res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
  });

  router.post('/logout', async (req, res) => {
    await auth.logout(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, cookieOptions(secureCookies));
    res.status(204).end();
  });

  const setPassword =
    (use: (token: string, password: string) => Promise<SignedIn | null>, invalidLink: string): RequestHandler =>
    async (req, res) => {
      const body = SetPasswordRequest.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.issues[0]?.message ?? 'Invalid request' });
        return;
      }
      const result = await use(body.data.token, body.data.password);
      if (!result) {
        res.status(400).json({ error: invalidLink });
        return;
      }
      signIn(res, result);
    };

  router.post('/accept-invite', setPassword(auth.acceptInvite, 'This invite link is invalid, used or expired'));
  router.post('/reset-password', setPassword(auth.resetPassword, 'This reset link is invalid, used or expired'));

  return router;
}
