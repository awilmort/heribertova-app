// Git pre-commit hook (installed by simple-git-hooks, see package.json): refuses the commit when a
// staged file is voter data, an environment file or an AWS key CSV (scripts/forbidden-files.mjs).
import { execFileSync } from 'node:child_process';
import { findForbiddenFiles } from './forbidden-files.mjs';

// Added, copied, modified or renamed files; deleting a forbidden file is always allowed.
const staged = execFileSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean);

const forbidden = findForbiddenFiles(staged);
if (forbidden.length > 0) {
  console.error('Commit refused: these staged files must never be committed:\n');
  for (const { path, reason } of forbidden) console.error(`  ${path}  (${reason})`);
  console.error(
    '\nUnstage them with `git restore --staged <file>` and keep them out of the repository.',
  );
  process.exit(1);
}
