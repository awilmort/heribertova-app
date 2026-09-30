import type { SetupSuperadminRequest } from '@heribertova/shared';
import mongoose, { Types } from 'mongoose';
import { hashPassword } from '../../lib/password';
import { encryptSecret } from '../../lib/secretBox';
import { generateTotpSecret } from '../../lib/totp';
import { AuditLogModel } from '../audit/model';
import { audit } from '../audit/service';
import { PersonModel } from '../people/model';
import { recintoKeyOf } from '../voters/voterFile';
import { UserModel, type UserDocument } from './model';
import { newPasswordProblem } from './service';

/**
 * Creating the one superadmin (plan 3.3), from `POST /api/setup/superadmin` — a one-time,
 * unauthenticated setup page (`/configuracion-inicial`) instead of a CLI wizard, so it needs
 * neither shell access to the server nor the padrón to be imported first. The operator vouches for
 * their own details directly (name, birth date, recinto, sector) rather than these coming from a
 * `voters` lookup; the account still represents a real person, just not one the app has verified
 * against the padrón. A TOTP secret is generated here too, but is only ever revealed at the first
 * login (`auth/totp.ts`'s `pendingEnrollment`), which is where the operator actually scans it.
 */

/**
 * A refusal the setup page shows as is (in Spanish, like the rest of the app's messages). `field`
 * is set when the message is about one form field (`password`) specifically, so the route can
 * attach it there instead of showing it as a general error.
 */
export class SuperadminSetupError extends Error {
  override name = 'SuperadminSetupError';
  readonly field: 'password' | null;

  constructor(message: string, field: 'password' | null = null) {
    super(message);
    this.field = field;
  }
}

const ALREADY_EXISTS = 'Ya existe un superadmin. Solo puede haber uno.';

/** Refuses when a superadmin exists. The unique partial index `one_superadmin` backs this up. */
export async function assertNoSuperadmin(): Promise<void> {
  if (await UserModel.exists({ role: 'superadmin' }))
    throw new SuperadminSetupError(ALREADY_EXISTS);
}

function isSecondSuperadmin(err: unknown): boolean {
  return (
    err instanceof mongoose.mongo.MongoServerError &&
    err.code === 11000 &&
    (err.keyPattern as Record<string, unknown> | undefined)?.role !== undefined
  );
}

/**
 * Creates the superadmin: its person and its account, with a strong password and an unrevealed
 * TOTP secret, in one audited transaction. Refuses a second superadmin, both here and, against a
 * concurrent setup submission, through the unique index.
 */
export async function setupSuperadmin(
  input: SetupSuperadminRequest,
  totpKey: Buffer,
): Promise<UserDocument> {
  const problem = newPasswordProblem(input.password, 'superadmin', input.birthDate);
  if (problem) throw new SuperadminSetupError(problem, 'password');
  // The guarantee is the index, so it must exist before the insert; transactions cannot create
  // collections or indexes as they go.
  await Promise.all([UserModel.init(), PersonModel.init(), AuditLogModel.init()]);
  await assertNoSuperadmin();

  // Hashing is slow on purpose: do it before the transaction, which may be retried.
  const passwordHash = await hashPassword(input.password);
  const totpSecretEnc = encryptSecret(totpKey, generateTotpSecret());
  // Chosen up front so the person can be registered by the account being created.
  const userId = new Types.ObjectId();

  try {
    return await mongoose.connection.transaction(async (session) => {
      const [person] = await PersonModel.create(
        [
          {
            cedula: input.cedula,
            voterSnapshot: {
              fullName: input.fullName,
              recintoKey: recintoKeyOf(input.recintoName, input.sector),
              recintoName: input.recintoName,
              colegioId: 0,
              sector: input.sector,
              birthDate: input.birthDate,
            },
            phone: input.phone,
            phoneWhatsapp: input.phoneWhatsapp,
            level: 'coordinator',
            leaderId: null,
            ancestors: [],
            registeredBy: userId,
            docStatus: 'pending',
            consentAt: new Date(),
          },
        ],
        { session },
      );
      if (!person) throw new Error('Person was not created');

      const [user] = await UserModel.create(
        [
          {
            _id: userId,
            personId: person._id,
            username: input.cedula,
            passwordHash,
            role: 'superadmin',
            usingDefaultPassword: false,
            totpSecretEnc,
            totpLastUsedStep: null,
          },
        ],
        { session },
      );
      if (!user) throw new Error('User was not created');

      await audit(
        { user, ip: null },
        {
          action: 'user.superadmin_created',
          entity: 'user',
          entityId: user._id,
          summary: `Creó la cuenta de superadmin de ${input.cedula} desde la configuración inicial.`,
        },
        session,
      );
      return user;
    });
  } catch (err) {
    if (isSecondSuperadmin(err)) throw new SuperadminSetupError(ALREADY_EXISTS);
    throw err;
  }
}
