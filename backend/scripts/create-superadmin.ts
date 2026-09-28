// Creates the one superadmin: the campaign owner, with a strong password and TOTP (plan 3.3).
// Needs MongoDB with the padrón imported (voters:import --apply) and TOTP_ENC_KEY set.
//
//   pnpm --filter @heribertova/backend superadmin:create      (local, from the repo)
//   node dist/scripts/create-superadmin.js                     (built; HERIBERTO_ARCHITECTURE.md A.3)
import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import password from '@inquirer/password';
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { createLogger } from '../src/lib/logger';
import { SuperadminSetupError } from '../src/modules/users/superadmin';
import {
  runCreateSuperadmin,
  type AnswerCheck,
  type SuperadminPrompts,
} from '../src/modules/users/superadminCli';

/** Inquirer shows the check's message and asks again until the check accepts the answer. */
const validate = (check: AnswerCheck) => (answer: string) => check(answer) ?? true;

const prompts: SuperadminPrompts = {
  text: (message, check) => input({ message, validate: validate(check) }),
  secret: (message, check) => password({ message, mask: '*', validate: validate(check) }),
  confirm: (message) => confirm({ message, default: false }),
};

const env = loadEnv();
await connectMongo(env.MONGODB_URI, createLogger('warn'));
try {
  await runCreateSuperadmin(prompts, (line) => console.log(line), env.TOTP_ENC_KEY);
} catch (err) {
  if (err instanceof SuperadminSetupError) {
    console.error(err.message);
  } else if (err instanceof Error && err.name === 'ExitPromptError') {
    console.error('Cancelado: no se creó nada.');
  } else {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}
