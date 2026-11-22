// Admin commands, run on the server by whoever manages the batch:
//   pnpm admin invite student@example.com   -> a link to create an account (valid 7 days)
//   pnpm admin reset  student@example.com   -> a link to choose a new password (valid 1 hour)
// Share the printed link with that student only. Each link works once.
import { Email } from '@skillbridge/shared';
import { createAuthService } from './auth/service.ts';
import { lazyAuthCollections } from './auth/store.ts';
import { createMongo } from './db/mongo.ts';
import { loadEnv } from './env.ts';

const [command, rawEmail] = process.argv.slice(2);
const email = Email.safeParse(rawEmail);
if ((command !== 'invite' && command !== 'reset') || !email.success) {
  console.error('Usage: pnpm admin invite <email>   or   pnpm admin reset <email>');
  process.exit(1);
}

const env = loadEnv(process.env);
const mongo = createMongo(env.MONGODB_URI);
const auth = createAuthService(lazyAuthCollections(() => mongo.db()));

try {
  if (command === 'invite') {
    const token = await auth.createInvite(email.data);
    console.log(`Invite for ${email.data} (valid 7 days, works once):\n${env.APP_ORIGIN}/invite?token=${token}`);
  } else {
    const token = await auth.createReset(email.data);
    console.log(`Password reset for ${email.data} (valid 1 hour, works once):\n${env.APP_ORIGIN}/reset?token=${token}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await mongo.close();
}
