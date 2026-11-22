import { Analysis, RoleSummary } from '@skillbridge/shared';
import { api } from '../api.ts';

/** GET /api/roles — the roles a student can measure a resume against. */
export async function listRoles(): Promise<RoleSummary[]> {
  return RoleSummary.array().parse(await api<unknown>('/roles'));
}

/**
 * POST /api/analyses — starts an analysis (202), or returns the earlier one for the
 * same resume and role (200). The worker fills in the result a few seconds later.
 */
export async function startAnalysis(resumeId: string, roleId: string): Promise<Analysis> {
  return Analysis.parse(await api<unknown>('/analyses', { method: 'POST', body: { resumeId, roleId } }));
}

/** GET /api/analyses/:id — poll this until status is done or failed. */
export async function getAnalysis(id: string, signal?: AbortSignal): Promise<Analysis> {
  return Analysis.parse(await api<unknown>(`/analyses/${id}`, { signal }));
}

/** GET /api/analyses?resumeId= — one resume's analyses (or all of them), newest first. */
export async function listAnalyses(resumeId?: string, signal?: AbortSignal): Promise<Analysis[]> {
  const query = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : '';
  return Analysis.array().parse(await api<unknown>(`/analyses${query}`, { signal }));
}

export const isFinished = (analysis: Analysis) => analysis.status === 'done' || analysis.status === 'failed';
