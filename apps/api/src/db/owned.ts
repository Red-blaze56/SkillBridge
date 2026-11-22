import type { Collection, Document, Filter, OptionalUnlessRequiredId, UpdateFilter } from 'mongodb';

/** A stored document that belongs to one signed-in user. */
export type Owned<T extends Document> = T & { userId: string };

/**
 * The only way request code should reach a collection that holds personal data.
 * Every read, write and delete is limited to one user's documents, so a forgotten
 * filter can't expose or change another student's data.
 */
export function ownedBy<T extends Document>(collection: Collection<Owned<T>>, userId: string) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('ownedBy() needs the signed-in user id');
  }

  // userId goes last, so a filter can never widen the scope to another user.
  const scope = (filter: Filter<Owned<T>> = {}) => ({ ...filter, userId }) as Filter<Owned<T>>;

  return {
    findOne: (filter?: Filter<Owned<T>>) => collection.findOne(scope(filter)),
    find: (filter?: Filter<Owned<T>>) => collection.find(scope(filter)),
    countDocuments: (filter?: Filter<Owned<T>>) => collection.countDocuments(scope(filter)),
    insertOne: (doc: T) =>
      collection.insertOne({ ...doc, userId } as OptionalUnlessRequiredId<Owned<T>>),
    updateOne: (filter: Filter<Owned<T>>, update: UpdateFilter<Owned<T>>) =>
      collection.updateOne(scope(filter), keepOwner(update)),
    deleteOne: (filter: Filter<Owned<T>>) => collection.deleteOne(scope(filter)),
    deleteMany: (filter?: Filter<Owned<T>>) => collection.deleteMany(scope(filter)),
  };
}

/** An update may change anything except who owns the document. */
function keepOwner<T extends Document>(update: UpdateFilter<T>): UpdateFilter<T> {
  for (const [operator, fields] of Object.entries(update)) {
    if (!operator.startsWith('$')) {
      throw new Error('Updates must use operators such as $set, not a replacement document');
    }
    if (fields === null || typeof fields !== 'object') continue;
    // $rename: { other: 'userId' } would overwrite the owner too.
    const renamesToOwner = operator === '$rename' && Object.values(fields).includes('userId');
    if ('userId' in fields || renamesToOwner) {
      throw new Error(`An update may not change userId (found in ${operator})`);
    }
  }
  return update;
}
