import { HealthResponse } from '@skillbridge/shared';
import { api } from '../api.ts';

/** GET /api/health — the only public endpoint besides sign-in. */
export async function getHealth(): Promise<HealthResponse> {
  return HealthResponse.parse(await api<unknown>('/health'));
}
