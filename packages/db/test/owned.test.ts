import type { Collection } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { ownedBy, type Owned } from '../src/owned.ts';

interface Note {
  text: string;
}

/** A stand-in collection that records what each method was called with. */
function fakeCollection() {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(null);
    };
  const methods = ['findOne', 'find', 'countDocuments', 'insertOne', 'updateOne', 'deleteOne', 'deleteMany'];
  const collection = Object.fromEntries(methods.map((m) => [m, record(m)])) as unknown as Collection<Owned<Note>>;
  /** The first argument (filter or document) of every call, in order. */
  const firstArgs = () => calls.map((c) => c.args[0]);
  return { collection, calls, firstArgs };
}

describe('ownedBy', () => {
  it('needs a user id', () => {
    const { collection } = fakeCollection();
    expect(() => ownedBy(collection, '')).toThrow(/user id/);
    expect(() => ownedBy(collection, '   ')).toThrow(/user id/);
  });

  it('limits every read to the user', async () => {
    const { collection, firstArgs } = fakeCollection();
    const notes = ownedBy<Note>(collection, 'alice');
    await notes.findOne({ text: 'a' });
    notes.find();
    await notes.countDocuments();
    expect(firstArgs()).toEqual([{ text: 'a', userId: 'alice' }, { userId: 'alice' }, { userId: 'alice' }]);
  });

  it("can't be widened to another user's documents", async () => {
    const { collection, firstArgs } = fakeCollection();
    await ownedBy<Note>(collection, 'alice').findOne({ userId: 'bob' });
    expect(firstArgs()).toEqual([{ userId: 'alice' }]);
  });

  it('stamps the owner on insert, even over a userId in the document', async () => {
    const { collection, firstArgs } = fakeCollection();
    await ownedBy<Note>(collection, 'alice').insertOne({ text: 'x', userId: 'bob' } as Note);
    expect(firstArgs()).toEqual([{ text: 'x', userId: 'alice' }]);
  });

  it('limits updates and deletes to the user', async () => {
    const { collection, calls } = fakeCollection();
    const notes = ownedBy<Note>(collection, 'alice');
    await notes.updateOne({ text: 'a' }, { $set: { text: 'b' } });
    await notes.deleteOne({ text: 'b' });
    await notes.deleteMany();
    expect(calls.map((c) => [c.method, c.args[0]])).toEqual([
      ['updateOne', { text: 'a', userId: 'alice' }],
      ['deleteOne', { text: 'b', userId: 'alice' }],
      ['deleteMany', { userId: 'alice' }],
    ]);
  });

  it('refuses updates that would change the owner', () => {
    const { collection, calls } = fakeCollection();
    const notes = ownedBy<Note>(collection, 'alice');
    expect(() => notes.updateOne({}, { $set: { userId: 'bob' } })).toThrow(/userId/);
    expect(() => notes.updateOne({}, { $unset: { userId: '' } })).toThrow(/userId/);
    expect(() => notes.updateOne({}, { $rename: { text: 'userId' } })).toThrow(/userId/);
    expect(() => notes.updateOne({}, { text: 'replaced' } as never)).toThrow(/operators/);
    expect(calls).toEqual([]);
  });
});
