// /api/roles and /api/analyses: pick a role, start a skill gap analysis of one of your
// resumes, and poll it until the evidence worker has saved the score.
//
//   POST /api/analyses ─► saves { status: queued } ─► publishes an analyze job ─► 202
//   workers/evidence    ─► running ─► done (result) | failed (error)
//   GET  /api/analyses/:id   until status is done or failed
import express from 'express';
import type { Request } from 'express';
import { ObjectId, type WithId } from 'mongodb';
import { FORMULA_VERSION, PROMPT_VERSION } from '@skillbridge/analysis/versions';
import { ownedBy, type AnalysisCollection, type AnalysisDoc, type Owned } from '@skillbridge/db';
import { QueueUnavailableError, type Queue } from '@skillbridge/queue';
import { getRole, roleSkills, ROLES } from '@skillbridge/roles';
import { ANALYZE_JOB, AnalysisRequest, type Analysis, type RoleSummary } from '@skillbridge/shared';
import { currentUser } from './auth/http.ts';
import type { ResumeCollection } from './resumes.ts';
import type { DailyLimit } from './usage.ts';

export interface AnalysisOptions {
  analyses: AnalysisCollection;
  resumes: ResumeCollection;
  queue: Pick<Queue, 'publish'>;
  /** New analyses per student per day. Reused results don't count. */
  limit: DailyLimit;
  /** The model the worker runs, recorded so a result from another model isn't reused. */
  model: string;
  now?: () => Date;
}

const ROLE_SUMMARIES: RoleSummary[] = ROLES.map((role) => ({
  id: role.id,
  name: role.name,
  version: role.version,
  summary: role.summary,
  skills: roleSkills(role).map((s) => ({ id: s.id, name: s.name, weight: s.weight })),
}));

export function roleRoutes() {
  const router = express.Router();
  router.get('/', (_req, res) => {
    res.json(ROLE_SUMMARIES);
  });
  return router;
}

function view(doc: WithId<Owned<AnalysisDoc>>): Analysis {
  return {
    id: doc._id.toHexString(),
    resumeId: doc.resumeId.toHexString(),
    roleId: doc.roleId,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    result: doc.result,
    error: doc.error,
  };
}

const objectId = (raw: unknown) => (typeof raw === 'string' && /^[0-9a-f]{24}$/.test(raw) ? new ObjectId(raw) : null);

export function analysisRoutes({ analyses, resumes, queue, limit, model, now = () => new Date() }: AnalysisOptions) {
  const router = express.Router();
  const mine = async (req: Request) => ownedBy<AnalysisDoc>(await analyses(), currentUser(req).uid);

  router.post('/', async (req, res) => {
    const body = AnalysisRequest.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Send a resumeId and a roleId.' });
      return;
    }
    const role = getRole(body.data.roleId);
    if (!role) {
      res.status(400).json({ error: 'There is no such role.' });
      return;
    }
    const { uid } = currentUser(req);
    const resumeId = new ObjectId(body.data.resumeId);
    const resume = await ownedBy(await resumes(), uid).findOne({ _id: resumeId }, { projection: { status: 1, expiresAt: 1 } });
    if (!resume) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (resume.status !== 'parsed') {
      res.status(422).json({ error: "This resume's text couldn't be read, so it can't be analysed. Try another PDF." });
      return;
    }

    // The same resume, role and versions give the same answer: reuse a finished or
    // running analysis instead of asking Gemini again. Failed ones can be retried.
    const collection = await mine(req);
    const same = {
      resumeId,
      roleId: role.id,
      roleVersion: role.version,
      promptVersion: PROMPT_VERSION,
      formulaVersion: FORMULA_VERSION,
      model,
    };
    // With options, the driver's types drop _id from findOne's result; it's there.
    const existing = (await collection.findOne(
      { ...same, status: { $in: ['queued', 'running', 'done'] } },
      { sort: { createdAt: -1 } },
    )) as WithId<Owned<AnalysisDoc>> | null;
    if (existing) {
      res.status(200).json(view(existing));
      return;
    }

    if ((await limit.remaining(uid)) <= 0) {
      res.status(429).json({ error: 'You have used all of today’s analyses. Try again tomorrow.' });
      return;
    }

    const at = now();
    const doc: AnalysisDoc = {
      ...same,
      status: 'queued',
      leaseUntil: null,
      attempts: 0,
      result: null,
      error: null,
      createdAt: at,
      updatedAt: at,
      expiresAt: resume.expiresAt, // goes when the resume goes
    };
    const { insertedId } = await collection.insertOne(doc);
    try {
      await queue.publish(ANALYZE_JOB, { analysisId: insertedId.toHexString() }, { messageId: insertedId.toHexString() });
    } catch (error) {
      await collection.deleteOne({ _id: insertedId });
      if (!(error instanceof QueueUnavailableError)) throw error;
      res.status(503).json({ error: 'Analyses are unavailable right now. Please try again in a minute.' });
      return;
    }
    await limit.record(uid);
    res.status(202).json(view({ _id: insertedId, userId: uid, ...doc }));
  });

  // Your analyses, newest first; ?resumeId= for one resume's.
  router.get('/', async (req, res) => {
    let filter = {};
    if (req.query.resumeId !== undefined) {
      const resumeId = objectId(req.query.resumeId);
      if (!resumeId) {
        res.json([]);
        return;
      }
      filter = { resumeId };
    }
    const docs = await (await mine(req)).find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    res.json((docs as WithId<Owned<AnalysisDoc>>[]).map(view));
  });

  router.get('/:id', async (req, res) => {
    const id = objectId(req.params.id);
    const doc = id ? ((await (await mine(req)).findOne({ _id: id })) as WithId<Owned<AnalysisDoc>> | null) : null;
    if (!doc) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(view(doc));
  });

  return router;
}
