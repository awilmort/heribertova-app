import { describe, expect, it } from 'vitest';
import { findForbiddenFiles, forbiddenReason } from './forbidden-files.mjs';

describe('forbiddenReason', () => {
  it.each([
    'padron_higuey_mayo2024.json',
    'padron_test.json',
    'padron_2026.csv',
    'data/padron_higuey.json',
    'backend/fixtures/PADRON_Higuey.json',
  ])('refuses voter data: %s', (path) => {
    expect(forbiddenReason(path)).toBe('voter data (padron_*)');
  });

  it.each([
    '.env',
    'backend/.env',
    'frontend/.env.local',
    '.env.production',
    '.env.development.local',
    'prod.env',
    'backend/secrets.ENV',
  ])('refuses environment files: %s', (path) => {
    expect(forbiddenReason(path)).toBe('environment file (.env*, *.env)');
  });

  it.each([
    'heribertova-api-prod_accessKeys.csv',
    'Downloads/admin_accessKeys.csv',
    'credentials.csv',
    'new_user_credentials.csv',
    'rootkey.csv',
  ])('refuses AWS access-key CSVs: %s', (path) => {
    expect(forbiddenReason(path)).toBe('AWS access-key CSV');
  });

  it.each([
    '.env.example',
    'backend/.env.example',
    'frontend/.env.example',
    'README.md',
    'docker-compose.dev.yml',
    'backend/src/config/env.ts',
    'backend/src/config/env.test.ts',
    'frontend/lib/environment.ts',
    'docs/padron-format.md',
    'backend/src/modules/voters/padron.ts',
    'reports/members.csv',
    'credentials.ts',
    'accessKeys.md',
    'brand/logo-horizontal.svg',
  ])('allows ordinary files: %s', (path) => {
    expect(forbiddenReason(path)).toBeNull();
  });
});

describe('findForbiddenFiles', () => {
  it('returns only the forbidden paths, each with its reason, in input order', () => {
    expect(
      findForbiddenFiles(['README.md', 'padron_test.json', '.env.example', 'backend/.env']),
    ).toEqual([
      { path: 'padron_test.json', reason: 'voter data (padron_*)' },
      { path: 'backend/.env', reason: 'environment file (.env*, *.env)' },
    ]);
  });

  it('returns nothing for a clean change set or an empty one', () => {
    expect(findForbiddenFiles(['backend/src/app.ts', '.env.example'])).toEqual([]);
    expect(findForbiddenFiles([])).toEqual([]);
  });
});
