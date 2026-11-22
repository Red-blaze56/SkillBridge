import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, safe to put in a URL or a cookie. Used for sessions, invites and resets. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores instead of the token itself, so a leaked database
 * row can't be used to sign in or to open an invite link.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
