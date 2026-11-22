/** A JSON request to the API. Returns the parsed body, or the API's error message. */
export async function api(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return { ok: true, data };
  const message =
    typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `Request failed (HTTP ${res.status})`;
  return { ok: false, status: res.status, error: message };
}
