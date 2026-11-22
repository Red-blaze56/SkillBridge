import { z } from 'zod';

const EnvSchema = z.object({
  // A missing NODE_ENV means production: anything that relaxes security has to be
  // switched on deliberately, never left on by default.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/skillbridge?directConnection=true'),
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
