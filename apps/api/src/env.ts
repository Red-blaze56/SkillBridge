import { z } from 'zod';

const EnvSchema = z.object({
  // A missing NODE_ENV means production: anything that relaxes security has to be
  // switched on deliberately, never left on by default.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/skillbridge?directConnection=true'),
  // Where the web app runs. Requests that change data must come from here.
  APP_ORIGIN: z
    .url()
    .default('http://localhost:5173')
    .transform((url) => new URL(url).origin),
  // Number of reverse proxies in front of the API (1 behind Nginx).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  // The mock-interview service (services/interview) and the secret it shares with this API.
  // Left empty, mock interviews are switched off.
  INTERVIEW_SERVICE_URL: z.url().default('http://127.0.0.1:8100'),
  INTERVIEW_SERVICE_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
  INTERVIEWS_PER_DAY: z.coerce.number().int().min(1).max(50).default(3),
});

export type Env = z.infer<typeof EnvSchema>;

/** Reads and checks the environment once at startup, so a typo fails loudly instead of later. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
