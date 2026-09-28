// Root-level tooling only (scripts/); each workspace package has its own eslint.config.mjs.
import { typescriptConfig } from './eslint.base.mjs';

export default typescriptConfig(import.meta.dirname);
