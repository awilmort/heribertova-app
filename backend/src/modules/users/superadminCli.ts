import {
  cedulaDigits,
  cedulaSchema,
  formatCedula,
  phoneDigits,
  phoneSchema,
} from '@heribertova/shared';
import QRCode from 'qrcode';
import type { z } from 'zod';
import { generateTotpSecret, matchTotpStep, totpUri } from '../../lib/totp';
import {
  assertNoSuperadmin,
  createSuperadmin,
  findOwnerVoter,
  SuperadminSetupError,
  type OwnerContact,
} from './superadmin';
import { newPasswordProblem } from './service';

/**
 * `pnpm --filter @heribertova/backend superadmin:create`: the conversation that creates the one
 * superadmin (plan 3.3). `scripts/create-superadmin.ts` only wires it to the terminal, the
 * environment and the database.
 */

/** A check on an answer: the message to show before asking again, or null to accept it. */
export type AnswerCheck = (answer: string) => string | null;

/** How the command talks to the operator. Each question resolves only with an accepted answer. */
export interface SuperadminPrompts {
  text(message: string, check: AnswerCheck): Promise<string>;
  /** Like `text`, without echoing what is typed. */
  secret(message: string, check: AnswerCheck): Promise<string>;
  confirm(message: string): Promise<boolean>;
}

/** The label the authenticator app shows: no cédula or name on the phone. */
const TOTP_LABEL = 'superadmin';

/** Checks the digits of an answer (typed with or without dashes, spaces…) against `schema`. */
function schemaCheck(schema: z.ZodType, digitsOf: (input: string) => string): AnswerCheck {
  return (answer) => schema.safeParse(digitsOf(answer)).error?.issues[0]?.message ?? null;
}

async function askContact(prompts: SuperadminPrompts): Promise<OwnerContact> {
  const phone = phoneDigits(
    await prompts.text('Teléfono (10 dígitos):', schemaCheck(phoneSchema, phoneDigits)),
  );
  const phoneWhatsapp = await prompts.confirm('¿Ese teléfono tiene WhatsApp?');
  return { phone, phoneWhatsapp };
}

/**
 * Enrolls the authenticator app: shows the secret as a QR code and as text, then asks for the
 * current code, so the account is created only once the app is known to produce valid codes.
 * Returns the secret and the time step of the accepted code.
 */
async function enrollTotp(
  prompts: SuperadminPrompts,
  print: (line: string) => void,
  now: () => number,
): Promise<{ secret: string; step: number }> {
  const secret = generateTotpSecret();
  const uri = totpUri(secret, TOTP_LABEL);
  print('');
  print(
    'Escanee este código QR con su aplicación de autenticación (Google Authenticator, Authy…):',
  );
  print(await QRCode.toString(uri, { type: 'terminal', small: true }));
  print(`O agregue la cuenta a mano con esta clave: ${secret}`);
  print(`URI: ${uri}`);
  print('Guarde la clave en un lugar seguro y borre esta terminal al terminar.');
  print('');

  // Set by the check, so the step is the one the accepted code matched at that moment.
  let step = null as number | null;
  await prompts.text('Código de 6 dígitos que muestra la aplicación:', (answer) => {
    step = matchTotpStep(secret, answer.trim(), now());
    return step === null ? 'El código no coincide. Escriba el código que se muestra ahora.' : null;
  });
  if (step === null) throw new Error('The prompt accepted a code the check refused');
  return { secret, step };
}

/**
 * Creates the superadmin by asking the operator for the owner's cédula, contact (when the owner has
 * no person yet), password and TOTP enrollment. Refuses up front when a superadmin exists.
 * Throws `SuperadminSetupError` for refusals the operator should read.
 */
export async function runCreateSuperadmin(
  prompts: SuperadminPrompts,
  print: (line: string) => void,
  totpKey: Buffer,
  now: () => number = Date.now,
): Promise<void> {
  await assertNoSuperadmin();

  const cedula = cedulaDigits(
    await prompts.text('Cédula del dueño de la campaña:', schemaCheck(cedulaSchema, cedulaDigits)),
  );
  const owner = await findOwnerVoter(cedula);
  const { snapshot } = owner;
  print(
    `${snapshot.fullName} · ${formatCedula(cedula)} · ${snapshot.recintoName} (${snapshot.sector})`,
  );
  if (!(await prompts.confirm('¿Es esta la persona que será superadmin?'))) {
    throw new SuperadminSetupError('Cancelado: no se creó nada.');
  }

  const contact = owner.existingPersonId ? null : await askContact(prompts);
  const password = await prompts.secret('Contraseña (al menos 14 caracteres):', (answer) =>
    newPasswordProblem(answer, 'superadmin', snapshot.birthDate),
  );
  await prompts.secret('Repita la contraseña:', (answer) =>
    answer === password ? null : 'Las contraseñas no coinciden.',
  );
  const totp = await enrollTotp(prompts, print, now);

  const user = await createSuperadmin(
    { owner, contact, password, totpSecret: totp.secret, totpStep: totp.step },
    totpKey,
  );
  print(
    `Superadmin creado (usuario ${user.id}). Inicie sesión con su cédula, su contraseña y el código de la aplicación.`,
  );
}
