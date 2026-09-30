// Creates the superadmin for LOCAL DEVELOPMENT AND MANUAL TESTING ONLY, with fabricated profile
// details instead of the `/configuracion-inicial` form (the real flow, plan 3.3). Refuses to run
// outside development. TOTP is still required to log in — the app shows the QR code on first
// login, same as it would for a superadmin created through the real setup page.
//
//   npm run superadmin:seed --workspace=backend
//   npm run superadmin:seed --workspace=backend -- --cedula 00100000009 --password "otra frase larga"
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { createLogger } from '../src/lib/logger';
import { seedSuperadmin } from '../src/modules/users/seedSuperadmin';
import { SuperadminSetupError } from '../src/modules/users/superadmin';

const DEFAULT_CEDULA = '00100000001';
const DEFAULT_PASSWORD = 'DevSuperadmin2024!';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    cedula: { type: 'string', default: DEFAULT_CEDULA },
    password: { type: 'string', default: DEFAULT_PASSWORD },
  },
});

const env = loadEnv();
if (env.NODE_ENV === 'production') {
  console.error(
    'superadmin:seed is for local development only and refuses to run with NODE_ENV=production.',
  );
  console.error('Use `/configuracion-inicial` in the running app instead.');
  process.exit(1);
}

await connectMongo(env.MONGODB_URI, createLogger('warn'));
try {
  const result = await seedSuperadmin(
    { cedula: values.cedula, password: values.password },
    env.TOTP_ENC_KEY,
  );
  console.log(`Superadmin creado (usuario ${result.userId}).`);
  console.log(`Cédula: ${result.cedula}`);
  console.log(`Contraseña: ${values.password}`);
  console.log('Inicie sesión en la app: el código QR para su aplicación de autenticación aparece ahí.');
} catch (err) {
  if (err instanceof SuperadminSetupError) {
    console.error(err.message);
  } else {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}
