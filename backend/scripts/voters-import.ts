// Imports a voter file from the local disk (plan 2.1; the superadmin screen of plan 9.1 reuses the
// same core). Needs MongoDB: locally `pnpm dev:up` first.
//
//   pnpm --filter @heribertova/backend voters:import --file <path> --dry-run
//   pnpm --filter @heribertova/backend voters:import --file <path> --cut mayo2024 [--apply]
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { createLogger } from '../src/lib/logger';
import {
  connectOptionsFor,
  parseImportArgs,
  runVoterImport,
  USAGE,
  UsageError,
  type ImportCliOptions,
} from '../src/modules/imports/cli';

let options: ImportCliOptions;
try {
  options = parseImportArgs(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
} catch (err) {
  if (!(err instanceof UsageError)) throw err;
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(2);
}

const env = loadEnv();
await connectMongo(env.MONGODB_URI, createLogger('warn'), connectOptionsFor(options.mode));
try {
  await runVoterImport(options, (line) => console.log(line));
} catch (err) {
  console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}
