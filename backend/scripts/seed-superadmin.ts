// Creates the superadmin for LOCAL DEVELOPMENT AND MANUAL TESTING ONLY, without needing an
// imported voter file first (compare `scripts/create-superadmin.ts`, the real flow, which requires
// the owner to be an actual Higüey voter and asks the operator to confirm a TOTP code). Refuses to
// run outside development. TOTP is still required to log in — scan the printed QR once.
//
//   npm run superadmin:seed --workspace=backend
//   npm run superadmin:seed --workspace=backend -- --cedula 00100000009 --password "otra frase larga"
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
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
  console.error(
    'Use `npm run superadmin:create --workspace=backend` instead (requires the imported padrón).',
  );
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
  console.log('');
  console.log('Escanee este código con su aplicación de autenticación para poder iniciar sesión:');
  console.log(await QRCode.toString(result.totpUri, { type: 'terminal', small: true }));
  console.log(`O agréguela a mano con esta clave: ${result.totpSecret}`);
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
