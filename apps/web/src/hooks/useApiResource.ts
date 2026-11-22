import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-loading hook: reloads when `key` changes, and ignores results that
 * arrive after unmount or after a newer request started.
 */
export function useApiResource<T>(loader: () => Promise<T>, key = '', skip = false) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    loaderRef
      .current()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Something went wrong');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [key, reloadKey, skip]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return { data, loading, error, reload, setData };
}
