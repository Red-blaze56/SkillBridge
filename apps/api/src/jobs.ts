// /api/jobs/matches: the fresher-friendly developer jobs the jobs worker collected, scored
// against the student's own skill gap analysis. Scoring is code, done per request, so a
// new analysis changes the matches straight away.
import express from 'express';
import type { Request } from 'express';
import { ObjectId, type Filter, type WithId } from 'mongodb';
import { ownedBy, type AnalysisCollection, type AnalysisDoc, type JobPostingCollection, type JobPostingDoc, type Owned } from '@skillbridge/db';
import { matchPosting } from '@skillbridge/jobs';
import { SKILLS } from '@skillbridge/roles';
import type { JobMatch, JobMatches } from '@skillbridge/shared';
import { currentUser } from './auth/http.ts';

export interface JobOptions {
  postings: JobPostingCollection;
  analyses: AnalysisCollection;
  now?: () => Date;
}

/** How many postings are scored per request: plenty for one role, and bounded. */
const SCAN_LIMIT = 2000;
const DEFAULT_LIMIT = 50;

const objectId = (raw: unknown) => (typeof raw === 'string' && /^[0-9a-f]{24}$/.test(raw) ? new ObjectId(raw) : null);

export function jobRoutes({ postings, analyses, now = () => new Date() }: JobOptions) {
  const router = express.Router();

  router.get('/matches', async (req: Request, res) => {
    const mine = ownedBy<AnalysisDoc>(await analyses(), currentUser(req).uid);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const where = req.query.where === 'india' || req.query.where === 'remote' ? req.query.where : 'any';

    // ?analysisId= picks one; otherwise the newest finished analysis (for ?roleId= if given).
    let analysis: WithId<Owned<AnalysisDoc>> | null;
    if (req.query.analysisId !== undefined) {
      const id = objectId(req.query.analysisId);
      analysis = id ? ((await mine.findOne({ _id: id, status: 'done' })) as WithId<Owned<AnalysisDoc>> | null) : null;
      if (!analysis) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    } else {
      const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : undefined;
      analysis = (await mine.findOne(
        { status: 'done', ...(roleId ? { roleId } : {}) },
        { sort: { createdAt: -1 } },
      )) as WithId<Owned<AnalysisDoc>> | null;
    }

    const c = await postings();
    const newest = await c.findOne({}, { sort: { fetchedAt: -1 }, projection: { fetchedAt: 1 } });
    const updatedAt = newest?.fetchedAt.toISOString() ?? null;

    if (!analysis?.result) {
      const body: JobMatches = { analysis: null, matches: [], total: 0, updatedAt };
      res.json(body);
      return;
    }
    const result = analysis.result;

    const filter: Filter<JobPostingDoc> = { roles: analysis.roleId, expiresAt: { $gt: now() } };
    if (where === 'india') filter.inIndia = true;
    if (where === 'remote') filter.remote = true;
    const docs = await c.find(filter).sort({ postedAt: -1, _id: 1 }).limit(SCAN_LIMIT).toArray();

    // The same job listed twice (another city, another board): keep the newest.
    const seen = new Set<string>();
    const unique = docs.filter((d) => !seen.has(d.fingerprint) && seen.add(d.fingerprint));

    const scored = unique.map((doc) => ({ doc, match: matchPosting(doc.skills, result) }));
    scored.sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1));

    const matches: JobMatch[] = scored.slice(0, limit).map(({ doc, match }) => ({
      id: doc._id,
      company: doc.company,
      title: doc.title,
      location: doc.location,
      url: doc.url,
      remote: doc.remote,
      postedAt: doc.postedAt?.toISOString() ?? null,
      experience: doc.experience,
      score: match.score,
      strong: match.strong,
      weak: match.weak,
      missing: match.missing,
      unchecked: match.unchecked.map((id) => SKILLS[id]?.name ?? id),
    }));

    const body: JobMatches = {
      analysis: {
        id: analysis._id.toHexString(),
        resumeId: analysis.resumeId.toHexString(),
        roleId: analysis.roleId,
        score: result.score,
        createdAt: analysis.createdAt.toISOString(),
      },
      matches,
      total: unique.length,
      updatedAt,
    };
    res.json(body);
  });

  return router;
}
