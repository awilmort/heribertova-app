// Writes a synthetic Higüey voter file in exactly the real export's shape (no real personal data).
//
//   npm run voters:fake --workspace=backend -- --out tmp/voters.json [--voters 20] [--seed 2024]
//
// tmp/ is gitignored. Never name it padron_*: that prefix is reserved for the real file (the hook refuses it).
//
// 20 voters is enough to click through the app manually (padrón lookup, registration); use a
// larger --voters for load checks (20,000 is a comfortable size; 181,551 reproduces the real file).
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFakeVoterFile } from '../test/fakeVoterFile';

const USAGE =
  'Usage: npm run voters:fake --workspace=backend -- --out <path> [--voters 20] [--seed 2024]';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    out: { type: 'string' },
    voters: { type: 'string', default: '20' },
    seed: { type: 'string', default: '2024' },
  },
  strict: true,
});
const voters = Number(values.voters);
const seed = Number(values.seed);
if (!values.out || !Number.isInteger(voters) || voters < 0 || !Number.isInteger(seed)) {
  console.error(USAGE);
  process.exit(2);
}

const out = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
await mkdir(dirname(out), { recursive: true });
await writeFakeVoterFile(out, { voters, seed });
console.log(`Wrote ${voters.toLocaleString('en-US')} synthetic voters to ${out}`);
