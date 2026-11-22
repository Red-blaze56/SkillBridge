// The analyzer against a real MongoDB (a throwaway database) and a scripted model.
import { randomBytes } from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModelFactory } from '@skillbridge/analysis';
import { lazyAnalyses, resumesIn, type AnalysisDoc, type Owned } from '@skillbridge/db';
import { PermanentError } from '@skillbridge/queue';
import { createAnalyzer, LEASE_MS, TRY_AGAIN } from '../src/analyzer.ts';

const MONGODB_URI = process.env.MONGODB_TEST_URI ?? 'mongodb://127.0.0.1:27017/?directConnection=true';
let client: MongoClient;
let db: Db;
const analyses = lazyAnalyses(async () => db);

const NOW = new Date('2026-11-23T10:00:00Z');
const ALICE = 'alice-id';
const BOB = 'bob-id';

/** A model that cites Node.js once, then says done. Counts how often it was asked. */
function fakeModel() {
  const counter = { calls: 0 };
  const model: ModelFactory = () => ({
    invoke: async () =>
      ++counter.calls === 1
        ? new AIMessage({
            content: '',
            tool_calls: [{ id: 'c1', name: 'submit_evidence', args: { skill_id: 'node', level: 3, passage_id: 1, quote: 'Node.js' } }],
          })
        : new AIMessage('done'),
  });
  return { model, counter };
}

const failingModel: ModelFactory = () => ({
  invoke: async () => {
    throw new Error('503 Service Unavailable');
  },
});

async function seed({ owner = ALICE, resumeOwner = ALICE, ...overrides }: Partial<AnalysisDoc> & { owner?: string; resumeOwner?: string } = {}) {
  const resumeId = new ObjectId();
  await resumesIn(db).insertOne({
    _id: resumeId,
    userId: resumeOwner,
    status: 'parsed',
    passages: [{ id: 1, section: 'experience', page: 1, text: 'Built REST APIs in Node.js at Acme' }],
    expiresAt: new Date('2026-12-23T00:00:00Z'),
  });
  const doc: Owned<AnalysisDoc> = {
    userId: owner,
    resumeId,
    roleId: 'backend-developer',
    roleVersion: '1.0.0',
    promptVersion: 'skill-evidence-2',
    formulaVersion: '1.0.0',
    model: 'test-model',
    status: 'queued',
    leaseUntil: null,
    attempts: 0,
    result: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date('2026-12-23T00:00:00Z'),
    ...overrides,
  };
  const { insertedId } = await (await analyses()).insertOne(doc);
  return insertedId.toHexString();
}

const load = async (id: string) => (await analyses()).findOne({ _id: new ObjectId(id) });

function analyzer(model: ModelFactory) {
  return createAnalyzer({ analyses, db: async () => db, model, modelName: 'test-model', now: () => NOW });
}

beforeAll(async () => {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  db = client.db(`skillbridge-test-${randomBytes(4).toString('hex')}`);
});
afterAll(async () => {
  await db?.dropDatabase();
  await client?.close();
});
beforeEach(async () => {
  await (await analyses()).deleteMany({});
  await resumesIn(db).deleteMany({});
});

describe('the evidence worker', () => {
  it('claims a queued analysis, runs the agent and saves the score', async () => {
    const { model, counter } = fakeModel();
    const id = await seed();

    await analyzer(model).handle({ analysisId: id });

    const saved = await load(id);
    expect(saved).toMatchObject({ status: 'done', attempts: 1, leaseUntil: null, error: null });
    expect(saved!.result!.skills.find((s) => s.skillId === 'node')).toMatchObject({ level: 3 });
    expect(saved!.result!.score).toBeGreaterThan(0);
    expect(counter.calls).toBe(2);
  });

  it('does nothing for a job that is already done (a second delivery)', async () => {
    const { model, counter } = fakeModel();
    const id = await seed({ status: 'done' });
    await analyzer(model).handle({ analysisId: id });
    expect(counter.calls).toBe(0);
    expect(await load(id)).toMatchObject({ status: 'done', attempts: 0 });
  });

  it('does nothing when the analysis was deleted', async () => {
    const { model, counter } = fakeModel();
    await analyzer(model).handle({ analysisId: new ObjectId().toHexString() });
    expect(counter.calls).toBe(0);
  });

  it('leaves a job another worker holds, and takes it over once the lease runs out', async () => {
    const { model, counter } = fakeModel();
    const held = await seed({ status: 'running', leaseUntil: new Date(NOW.getTime() + 60_000) });
    await expect(analyzer(model).handle({ analysisId: held })).rejects.toThrow(/held by another worker/);
    expect(counter.calls).toBe(0);

    const expired = await seed({ status: 'running', leaseUntil: new Date(NOW.getTime() - 1), attempts: 1 });
    await analyzer(model).handle({ analysisId: expired });
    expect(await load(expired)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it("never reads another student's resume", async () => {
    const { model, counter } = fakeModel();
    const id = await seed({ owner: BOB, resumeOwner: ALICE });
    await expect(analyzer(model).handle({ analysisId: id })).rejects.toThrow(PermanentError);
    expect(counter.calls).toBe(0);
  });

  it('releases the lease when the model fails, so the retry can start at once', async () => {
    const id = await seed();
    await expect(analyzer(failingModel).handle({ analysisId: id })).rejects.toThrow(/503/);
    expect(await load(id)).toMatchObject({ status: 'running', leaseUntil: null, attempts: 1 });
  });

  it('holds the lease for LEASE_MS while running', async () => {
    let leaseSeen: Date | null | undefined;
    const id = await seed();
    const peeking: ModelFactory = () => ({
      invoke: async () => {
        leaseSeen = (await load(id))!.leaseUntil;
        return new AIMessage({ content: '', tool_calls: [{ id: 'c', name: 'submit_evidence', args: { skill_id: 'git', level: 0 } }] });
      },
    });
    await analyzer(peeking).handle({ analysisId: id });
    expect(leaseSeen).toEqual(new Date(NOW.getTime() + LEASE_MS));
  });
});

describe('giving up', () => {
  it('marks the analysis failed with a message the student can act on', async () => {
    const worker = analyzer(failingModel);
    const busy = await seed({ status: 'running' });
    await worker.onGiveUp({ analysisId: busy }, new Error('503 Service Unavailable'));
    expect(await load(busy)).toMatchObject({ status: 'failed', error: TRY_AGAIN });

    const gone = await seed();
    await worker.onGiveUp({ analysisId: gone }, new PermanentError('The resume was deleted.'));
    expect(await load(gone)).toMatchObject({ status: 'failed', error: 'The resume was deleted.' });
  });

  it('keeps a result that was saved in the meantime', async () => {
    const id = await seed({ status: 'done' });
    await analyzer(failingModel).onGiveUp({ analysisId: id }, new Error('late'));
    expect(await load(id)).toMatchObject({ status: 'done', error: null });
  });
});
