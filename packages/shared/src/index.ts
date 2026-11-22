import { z } from 'zod';

/** The signed-in user a request runs as. Once sign-in lands, `uid` is the Firebase user id. */
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
