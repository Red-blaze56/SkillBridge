import { AuthUser } from '@skillbridge/shared';
import { api } from '../api.ts';

/** GET /api/me — the signed-in user, or a 401 when the cookie is missing or stale. */
export async function getMe(): Promise<AuthUser> {
  return AuthUser.parse(await api<unknown>('/me'));
}

/** POST /api/auth/login */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  return AuthUser.parse(
    await api<unknown>('/auth/login', { method: 'POST', body: { email, password } }),
  );
}

/** POST /api/auth/logout — clears the session cookie. */
export async function signOut(): Promise<void> {
  await api<void>('/auth/logout', { method: 'POST' });
}

/** POST /api/auth/accept-invite — sets a password from an invite link. */
export async function acceptInvite(token: string, password: string): Promise<AuthUser> {
  return AuthUser.parse(
    await api<unknown>('/auth/accept-invite', { method: 'POST', body: { token, password } }),
  );
}

/** POST /api/auth/reset-password — sets a password from a reset link. */
export async function resetPassword(token: string, password: string): Promise<AuthUser> {
  return AuthUser.parse(
    await api<unknown>('/auth/reset-password', { method: 'POST', body: { token, password } }),
  );
}
