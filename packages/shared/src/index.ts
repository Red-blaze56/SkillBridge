import { z } from 'zod';

/** The signed-in user a request runs as. `uid` is the user's MongoDB id. */
export const AuthUser = z.object({
  uid: z.string().min(1),
  email: z.email(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Response of GET /api/health. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  database: z.enum(['up', 'down']),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const PASSWORD_MIN_LENGTH = 12;
/** An upper bound keeps one sign-in from costing unbounded hashing time. */
export const PASSWORD_MAX_LENGTH = 128;

/** Emails are compared trimmed and lower-case everywhere. */
export const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

/** Rules for choosing a new password: long, with no forced symbols. */
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

/** POST /api/auth/login */
export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** POST /api/auth/accept-invite and /api/auth/reset-password */
export const SetPasswordRequest = z.object({
  token: z.string().min(1).max(100),
  password: NewPassword,
});
