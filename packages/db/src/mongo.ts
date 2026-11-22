import { MongoClient, type Db } from 'mongodb';

export interface Mongo {
  /** True when MongoDB answers a ping. */
  isUp(): Promise<boolean>;
  /** The database named in the connection string. Throws while MongoDB is unreachable. */
  db(): Promise<Db>;
  close(): Promise<void>;
}

/** The parts of MongoClient used here, so tests can pass a stand-in. */
type Client = Pick<MongoClient, 'connect' | 'close' | 'db'>;

/**
 * Holds the MongoDB client. The driver never retries a client whose first connection
 * failed (every later call throws "Topology is closed"), so a failed client is thrown
 * away and the next call starts a fresh one. That way the API recovers by itself when
 * MongoDB starts after it.
 */
export function createMongo(uri: string, newClient: (uri: string) => Client = defaultClient): Mongo {
  let client: Client | null = null;

  async function connected(): Promise<Client> {
    const current = (client ??= newClient(uri));
    try {
      await current.connect(); // resolves at once when already connected
      return current;
    } catch (error) {
      if (client === current) client = null;
      await current.close().catch(() => undefined);
      throw error;
    }
  }

  return {
    async isUp() {
      try {
        await (await connected()).db('admin').command({ ping: 1 });
        return true;
      } catch {
        return false;
      }
    },
    async db() {
      return (await connected()).db();
    },
    async close() {
      const current = client;
      client = null;
      await current?.close();
    },
  };
}

function defaultClient(uri: string): Client {
  return new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
}
