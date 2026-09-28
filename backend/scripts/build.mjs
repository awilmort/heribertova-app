// Bundles the API into dist/index.js, and the superadmin CLI into dist/scripts/create-superadmin.js
// (run once on the server or against production, HERIBERTO_ARCHITECTURE.md A.3). Workspace
// packages (@heribertova/shared, TypeScript source) are inlined; every npm dependency stays
// external and is installed on the server as usual.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@heribertova/'));

await build({
  entryPoints: {
    index: 'src/index.ts',
    'scripts/create-superadmin': 'scripts/create-superadmin.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
