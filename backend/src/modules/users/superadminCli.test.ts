import { formatCedula } from '@heribertova/shared';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  sessionTokenFrom,
  superadminChallengeToken,
  verifyTotp,
} from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { TEST_TOTP_KEY, totpCodeAt } from '../../../test/totp';
import { createTestPerson, createTestUser } from '../../../test/users';
import { PersonModel } from '../people/model';
import type { RawVoterRecord } from '../voters/voterFile';
import { UserModel } from './model';
import { SuperadminSetupError } from './superadmin';
import { runCreateSuperadmin, type AnswerCheck, type SuperadminPrompts } from './superadminCli';

useTestDatabase();

const PASSWORD = 'una frase larga y segura';
const STEP = 30 * 1000;
/** A fixed clock for the enrollment step. */
const NOW = 1_790_000_000_000;

let owner: RawVoterRecord;

beforeAll(async () => {
  await UserModel.createIndexes();
});

beforeEach(async () => {
  const padron = await importFakePadron(400);
  owner = padron[42] as RawVoterRecord;
});

/** An answer, or a function of what the command printed so far (to read the TOTP secret). */
type Answer = string | boolean | ((printed: string) => string);

/**
 * Scripted operator: answers the questions in order. Like the real prompts, a text answer the check
 * refuses is not returned: the refusal is recorded and the next answer is tried.
 */
function operator(answers: Answer[]) {
  const queue = [...answers];
  const questions: string[] = [];
  const refusals: string[] = [];
  const lines: string[] = [];
  const printed = () => lines.join('\n');

  function next(message: string): Answer {
    questions.push(message);
    if (queue.length === 0) throw new Error(`No answer left for "${message}"`);
    return queue.shift() as Answer;
  }

  function acceptedAnswer(message: string, check: AnswerCheck): string {
    for (;;) {
      const raw = next(message);
      const answer = typeof raw === 'function' ? raw(printed()) : raw;
      if (typeof answer !== 'string') throw new Error(`"${message}" needs a text answer`);
      const problem = check(answer);
      if (problem === null) return answer;
      refusals.push(problem);
    }
  }

  const ask = (message: string, check: AnswerCheck) =>
    Promise.resolve(acceptedAnswer(message, check));

  const prompts: SuperadminPrompts = {
    text: ask,
    secret: ask,
    confirm: (message) => {
      const answer = next(message);
      if (typeof answer !== 'boolean') throw new Error(`"${message}" needs a yes or no`);
      return Promise.resolve(answer);
    },
  };
  return {
    run: () =>
      runCreateSuperadmin(
        prompts,
        (line) => lines.push(line),
        TEST_TOTP_KEY,
        () => NOW,
      ),
    questions,
    refusals,
    printed,
    remaining: () => queue.length,
  };
}

/** The TOTP secret the command printed for manual entry. */
function printedSecret(printed: string): string {
  const match = /esta clave: ([A-Z2-7]+)/.exec(printed);
  if (!match?.[1]) throw new Error('No TOTP secret printed');
  return match[1];
}

/** The code the operator's authenticator app shows at `timestamp`. */
const appCode =
  (timestamp = NOW) =>
  (printed: string) =>
    totpCodeAt(timestamp, printedSecret(printed));

describe('runCreateSuperadmin', () => {
  it('creates the superadmin, who then logs in with the password and the app', async () => {
    const session = operator([
      formatCedula(owner.cedula),
      true,
      '(809) 555-1234',
      true,
      PASSWORD,
      PASSWORD,
      appCode(),
    ]);

    await session.run();

    expect(session.remaining()).toBe(0);
    expect(session.refusals).toEqual([]);
    const user = await UserModel.findOne({ role: 'superadmin' }).lean();
    expect(user).toMatchObject({
      username: owner.cedula,
      totpLastUsedStep: Math.floor(NOW / STEP),
    });
    expect(await PersonModel.findById(user?.personId).lean()).toMatchObject({
      cedula: owner.cedula,
      phone: '8095551234',
      phoneWhatsapp: true,
    });

    // End to end: the enrolled app's codes open a session through the API.
    const secret = printedSecret(session.printed());
    const app = buildTestApp();
    const challenge = await superadminChallengeToken(app, owner.cedula, PASSWORD);
    const res = await verifyTotp(app, challenge, totpCodeAt(Date.now(), secret));
    expect(res.status).toBe(204);
    expect(sessionTokenFrom(res)).toBeDefined();
  });

  it('prints the voter to confirm, the QR code, the otpauth URI and the secret', async () => {
    const session = operator([
      owner.cedula,
      true,
      '8295551234',
      false,
      PASSWORD,
      PASSWORD,
      appCode(),
    ]);
    await session.run();

    const printed = session.printed();
    const voterLine = printed.split('\n')[0] ?? '';
    expect(voterLine).toContain(owner.apellido1);
    expect(voterLine).toContain(formatCedula(owner.cedula));
    expect(voterLine).toContain(owner.descripcionSector);
    expect(printed).toMatch(/[▀▄█]/); // the terminal QR code
    const secret = printedSecret(printed);
    expect(printed).toContain(
      `URI: otpauth://totp/heribertova.do:superadmin?issuer=heribertova.do&secret=${secret}&algorithm=SHA1&digits=6&period=30`,
    );
    expect(printed).toContain('Superadmin creado');
  });

  it('refuses up front, before asking anything, when a superadmin exists', async () => {
    await createTestUser({ role: 'superadmin' });
    const session = operator([owner.cedula]);

    await expect(session.run()).rejects.toThrow(
      new SuperadminSetupError('Ya existe un superadmin. Solo puede haber uno.'),
    );
    expect(session.questions).toEqual([]);
    await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
  });

  it('asks again after each answer it cannot accept', async () => {
    const [year, month, day] = owner.fechaNacimiento.split('-');
    const session = operator([
      '001-123',
      owner.cedula,
      true,
      '305 555 1234',
      '8495551234',
      true,
      'corta',
      `${day} / ${month} / ${year}`,
      PASSWORD,
      'otra frase distinta',
      PASSWORD,
      '000000',
      appCode(NOW - 2 * STEP),
      appCode(),
    ]);

    await session.run();

    expect(session.refusals).toEqual([
      'La cédula debe tener 11 dígitos.',
      'El teléfono debe tener 10 dígitos y empezar por 809, 829 u 849.',
      'La contraseña debe tener al menos 14 caracteres.',
      'La nueva contraseña no puede ser su fecha de nacimiento.',
      'Las contraseñas no coinciden.',
      'El código no coincide. Escriba el código que se muestra ahora.',
      'El código no coincide. Escriba el código que se muestra ahora.',
    ]);
    await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
  });

  it('creates nothing when the operator does not confirm the voter', async () => {
    const session = operator([owner.cedula, false]);
    await expect(session.run()).rejects.toThrow(
      new SuperadminSetupError('Cancelado: no se creó nada.'),
    );
    await expect(UserModel.countDocuments()).resolves.toBe(0);
    await expect(PersonModel.countDocuments()).resolves.toBe(0);
  });

  it('refuses a cédula outside the padrón', async () => {
    const session = operator(['00000000001']);
    await expect(session.run()).rejects.toThrow(
      new SuperadminSetupError('Esa cédula no está en el padrón activo de Higüey.'),
    );
  });

  it('does not ask for a phone when the owner is already a registered person', async () => {
    await createTestPerson({ cedula: owner.cedula, registeredBy: (await createTestUser())._id });
    const session = operator([owner.cedula, true, PASSWORD, PASSWORD, appCode()]);

    await session.run();

    expect(session.questions.some((question) => question.startsWith('Teléfono'))).toBe(false);
    await expect(PersonModel.countDocuments({ cedula: owner.cedula })).resolves.toBe(1);
  });
});
