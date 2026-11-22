/**
 * Runs `setup` (e.g. creating a collection's indexes) the first time its result is
 * needed and reuses it after that. If setup fails (MongoDB is down), the next call
 * tries again, so the API keeps running while MongoDB starts.
 */
export function once<T>(setup: () => Promise<T>): () => Promise<T> {
  let ready: Promise<T> | undefined;
  return () =>
    (ready ??= setup().catch((error: unknown) => {
      ready = undefined;
      throw error;
    }));
}
