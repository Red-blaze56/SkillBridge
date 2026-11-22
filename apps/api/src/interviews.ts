import { Readable } from 'node:stream';
import express from 'express';
import type { Request, Response } from 'express';
import { currentUser } from './auth/http.ts';
import type { DailyLimit } from './usage.ts';

export interface InterviewServiceOptions {
  /** Where the interview service runs, e.g. http://127.0.0.1:8100. */
  url: string;
  /** The secret shared with the interview service. Without it, mock interviews are off. */
  token: string | undefined;
  /** How many mock interviews each student may start per day. */
  limit: DailyLimit;
}

const INTERVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 + 64 * 1024; // a 10 MB PDF plus form overhead
const TIMEOUT_MS = 90_000; // an interview turn waits for Gemini to grade and reply

type Body = { json: unknown } | { stream: Request };

/** The interview service's error text ({ "detail": "..." }), or a general message. */
function errorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string') {
    return data.detail;
  }
  return status === 422 ? 'Some of the interview details are not valid' : 'The interview service could not handle this request';
}

/**
 * /api/interviews/*, mounted behind sign-in. Each route forwards to the interview
 * service with the shared token and the signed-in student's id. Only these routes
 * exist: this is not a general-purpose proxy.
 */
export function interviewRoutes({ url, token, limit }: InterviewServiceOptions) {
  const router = express.Router();

  /** Calls the interview service for the signed-in student and relays its answer. True on success. */
  async function forward(req: Request, res: Response, method: 'GET' | 'POST', path: string, body?: Body) {
    if (!token) {
      res.status(503).json({ error: 'Mock interviews are not set up on this server yet' });
      return false;
    }
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'x-user-id': currentUser(req).uid };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (body && 'json' in body) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body.json ?? {});
    } else if (body) {
      headers['content-type'] = body.stream.get('content-type') ?? 'application/octet-stream';
      init.body = Readable.toWeb(body.stream) as unknown as ReadableStream; // streamed, not buffered
      init.duplex = 'half';
    }

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(new URL(path, url), init);
    } catch {
      res.status(503).json({ error: 'The interview service is not reachable. Try again in a moment.' });
      return false;
    }

    const data: unknown = await upstream.json().catch(() => null);
    if (upstream.ok) {
      res.status(upstream.status).json(data);
      return true;
    }
    if (upstream.status === 401) {
      // Our own credentials were refused: the student did nothing wrong, so no 401 for them.
      console.error('The interview service rejected our token. Check INTERVIEW_SERVICE_TOKEN in the root .env.');
      res.status(502).json({ error: 'The interview service is misconfigured. Please tell the admin.' });
      return false;
    }
    res.status(upstream.status).json({ error: errorMessage(data, upstream.status) });
    return false;
  }

  /** Runs a handler only for a well-formed interview id, so nothing odd reaches the service's URL. */
  const withId =
    (handler: (req: Request, res: Response, id: string) => Promise<unknown>) => async (req: Request, res: Response) => {
      const id = String(req.params.id);
      if (!INTERVIEW_ID.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await handler(req, res, id);
    };

  // The student's interviews, newest first. Only `limit` and `cursor` are passed on.
  router.get('/', async (req, res) => {
    const query = new URLSearchParams();
    const pageSize = Number(req.query.limit);
    if (Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100) query.set('limit', String(pageSize));
    if (typeof req.query.cursor === 'string' && req.query.cursor.length <= 200) query.set('cursor', req.query.cursor);
    const qs = query.toString();
    await forward(req, res, 'GET', qs ? `/interviews?${qs}` : '/interviews');
  });

  // Start an interview. Counts against the daily limit only when it really starts.
  router.post('/', async (req, res) => {
    const { uid } = currentUser(req);
    if ((await limit.remaining(uid)) <= 0) {
      res.status(429).json({ error: "You've used all of today's mock interviews. Try again tomorrow." });
      return;
    }
    if (await forward(req, res, 'POST', '/interviews', { json: req.body })) await limit.record(uid);
  });

  // Resume PDF -> text and interview agenda, while the student fills in the form.
  router.post('/parse-resume', async (req, res) => {
    if (Number(req.get('content-length') ?? 0) > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: 'Please upload a PDF under 10 MB.' });
      return;
    }
    await forward(req, res, 'POST', '/interviews/parse-resume', { stream: req });
  });

  router.get('/:id', withId((req, res, id) => forward(req, res, 'GET', `/interviews/${id}`)));
  router.post('/:id/answer', withId((req, res, id) => forward(req, res, 'POST', `/interviews/${id}/answer`, { json: req.body })));
  router.post('/:id/finish', withId((req, res, id) => forward(req, res, 'POST', `/interviews/${id}/finish`)));

  return router;
}
