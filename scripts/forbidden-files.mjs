// Files that must never be committed, whatever .gitignore says (`git add -f` bypasses it):
// real voter data, environment files with secrets, and AWS access-key downloads.
// Used by the pre-commit hook (scripts/pre-commit.mjs).

/** @typedef {{ reason: string, matches: (fileName: string) => boolean }} ForbiddenRule */

/** @type {ForbiddenRule[]} */
const RULES = [
  {
    reason: 'voter data (padron_*)',
    matches: (name) => name.startsWith('padron_'),
  },
  {
    // .env, .env.local, .env.production, prod.env ... but not the committed .env.example templates.
    reason: 'environment file (.env*, *.env)',
    matches: (name) =>
      !name.endsWith('.example') &&
      (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')),
  },
  {
    // AWS console downloads: <user>_accessKeys.csv, credentials.csv, rootkey.csv.
    reason: 'AWS access-key CSV',
    matches: (name) =>
      name.endsWith('.csv') &&
      ['accesskeys', 'credentials', 'rootkey'].some((k) => name.includes(k)),
  },
];

/**
 * Why `path` must not be committed, or null when it may be. Matches on the file name alone
 * (any directory), case-insensitively.
 * @param {string} path a repository-relative path as git prints it (forward slashes)
 * @returns {string | null}
 */
export function forbiddenReason(path) {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  return RULES.find((rule) => rule.matches(name))?.reason ?? null;
}

/**
 * The forbidden paths among `paths`, each with its reason.
 * @param {readonly string[]} paths
 * @returns {{ path: string, reason: string }[]}
 */
export function findForbiddenFiles(paths) {
  return paths.flatMap((path) => {
    const reason = forbiddenReason(path);
    return reason === null ? [] : [{ path, reason }];
  });
}
