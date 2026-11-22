import { JobMatches } from '@skillbridge/shared';
import { api } from '../api.ts';

export type Where = 'any' | 'india' | 'remote';

/**
 * GET /api/jobs/matches — fresher-friendly developer jobs scored against one of the
 * student's finished analyses (the newest when no id is given), best first.
 */
export async function getJobMatches(
  { analysisId, where = 'any', limit = 50 }: { analysisId?: string; where?: Where; limit?: number },
  signal?: AbortSignal,
): Promise<JobMatches> {
  const query = new URLSearchParams({ where, limit: String(limit) });
  if (analysisId) query.set('analysisId', analysisId);
  return JobMatches.parse(await api<unknown>(`/jobs/matches?${query.toString()}`, { signal }));
}
