// /api/resumes: upload a resume PDF, then list, view or delete your resumes.
// Every query goes through ownedBy(), so a student only ever reaches their own.
import express from 'express';
import type { Request } from 'express';
import { Binary, ObjectId, type Collection, type Db, type WithId } from 'mongodb';
import { MAX_BYTES, parseResume, PdfError, type ParsedResume } from '@skillbridge/resume';
import type { ResumeDetail, ResumeSummary } from '@skillbridge/shared';
import { currentUser } from './auth/http.ts';
import { once, ownedBy, type AnalysisCollection, type Owned } from '@skillbridge/db';

/** Resumes, their parsed text and the PDF are deleted this long after upload. */
export const RESUME_LIFETIME_DAYS = 30;
export const MAX_RESUMES_PER_STUDENT = 5;

export interface ResumeDoc extends ParsedResume {
  fileName: string;
  size: number;
  /** The original PDF, kept so it can be re-read later (e.g. by a better parser). */
  pdf: Binary;
  status: 'parsed' | 'unreadable';
  uploadedAt: Date;
  /** A TTL index deletes the whole document at this time. */
  expiresAt: Date;
}

export type ResumeCollection = () => Promise<Collection<Owned<ResumeDoc>>>;

export function lazyResumes(getDb: () => Promise<Db>): ResumeCollection {
  return once(async () => {
    const c = (await getDb()).collection<Owned<ResumeDoc>>('resumes');
    await Promise.all([
      c.createIndex({ userId: 1, uploadedAt: -1 }),
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return c;
  });
}

const WITHOUT_PDF = { projection: { pdf: 0 } };

/** The uploaded file's name from X-File-Name: no path, no control characters. */
function fileName(req: Request): string {
  let raw = req.get('x-file-name') ?? '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    raw = '';
  }
  const name = raw
    .split(/[\\/]/)
    .pop()!
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 120);
  return name || 'resume.pdf';
}

function summary(doc: WithId<Owned<ResumeDoc>>): ResumeSummary {
  return {
    id: doc._id.toHexString(),
    fileName: doc.fileName,
    uploadedAt: doc.uploadedAt.toISOString(),
    status: doc.status,
    pageCount: doc.pageCount,
    passageCount: doc.passages.length,
    hiddenCount: doc.hidden.length,
  };
}

function detail(doc: WithId<Owned<ResumeDoc>>): ResumeDetail {
  return { ...summary(doc), columns: doc.columns, passages: doc.passages, hidden: doc.hidden, quality: doc.quality };
}

/** A resume id from the URL, or null if it isn't one. */
function resumeId(raw: unknown): ObjectId | null {
  return typeof raw === 'string' && /^[0-9a-f]{24}$/.test(raw) ? new ObjectId(raw) : null;
}

export interface ResumeRouteOptions {
  now?: () => Date;
  /** Deleting a resume deletes its analyses too. */
  analyses?: AnalysisCollection;
}

export function resumeRoutes(resumes: ResumeCollection, { now = () => new Date(), analyses }: ResumeRouteOptions = {}) {
  const router = express.Router();
  const mine = async (req: Request) => ownedBy<ResumeDoc>(await resumes(), currentUser(req).uid);

  // Upload: the request body is the PDF itself (Content-Type: application/pdf).
  router.post('/', express.raw({ type: 'application/pdf', limit: MAX_BYTES }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(415).json({ error: 'Upload the resume as a PDF file.' });
      return;
    }
    const collection = await mine(req);
    if ((await collection.countDocuments()) >= MAX_RESUMES_PER_STUDENT) {
      res.status(409).json({ error: `You can keep up to ${MAX_RESUMES_PER_STUDENT} resumes. Delete one to upload another.` });
      return;
    }

    let parsed: ParsedResume;
    try {
      parsed = await parseResume(req.body);
    } catch (error) {
      if (!(error instanceof PdfError)) throw error;
      res.status(422).json({ error: error.message });
      return;
    }

    const uploadedAt = now();
    const doc: ResumeDoc = {
      ...parsed,
      fileName: fileName(req),
      size: req.body.length,
      pdf: new Binary(req.body),
      status: parsed.quality.readable ? 'parsed' : 'unreadable',
      uploadedAt,
      expiresAt: new Date(uploadedAt.getTime() + RESUME_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
    };
    const { insertedId } = await collection.insertOne(doc);
    const { pdf: _pdf, ...stored } = doc;
    res.status(201).json(detail({ _id: insertedId, userId: currentUser(req).uid, ...stored } as WithId<Owned<ResumeDoc>>));
  });

  // The student's resumes, newest first (without the PDFs).
  router.get('/', async (req, res) => {
    const docs = await (await mine(req)).find({}, WITHOUT_PDF).sort({ uploadedAt: -1 }).toArray();
    res.json(docs.map(summary));
  });

  router.get('/:id', async (req, res) => {
    const id = resumeId(req.params.id);
    // With options, the driver's types drop _id from findOne's result; it's there.
    const doc = id ? ((await (await mine(req)).findOne({ _id: id }, WITHOUT_PDF)) as WithId<Owned<ResumeDoc>> | null) : null;
    if (!doc) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(detail(doc));
  });

  router.delete('/:id', async (req, res) => {
    const id = resumeId(req.params.id);
    const { deletedCount } = id ? await (await mine(req)).deleteOne({ _id: id }) : { deletedCount: 0 };
    if (deletedCount && analyses) {
      await ownedBy(await analyses(), currentUser(req).uid).deleteMany({ resumeId: id! });
    }
    res.status(deletedCount ? 204 : 404).end();
  });

  return router;
}
