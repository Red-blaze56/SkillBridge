import { useEffect, useState } from 'react';
import { HealthResponse } from '@skillbridge/shared';

type ApiState =
  | { kind: 'checking' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

export function App() {
  const [api, setApi] = useState<ApiState>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setApi({ kind: 'ok', health: HealthResponse.parse(await res.json()) });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setApi({ kind: 'error', message: String(error) });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>SkillBridge</h1>
      <p>
        {api.kind === 'checking' && 'Checking the API…'}
        {api.kind === 'ok' && `API is up · database ${api.health.database}`}
        {api.kind === 'error' && `API is unreachable (${api.message})`}
      </p>
    </main>
  );
}
