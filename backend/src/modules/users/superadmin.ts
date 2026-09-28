import mongoose, { Types, type ClientSession } from 'mongoose';
import { hashPassword } from '../../lib/password';
import { encryptSecret } from '../../lib/secretBox';
import { AuditLogModel } from '../audit/model';
import { audit } from '../audit/service';
import { PersonModel, type VoterSnapshot } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import { UserModel, type UserDocument } from './model';
import { newPasswordProblem } from './service';

/**
 * Creating the one superadmin (plan 3.3): the campaign owner, from the command line only
 * (`scripts/create-superadmin.ts`, which drives this through `superadminCli.ts`).
 *
 * The owner is a Higüey voter like everyone else (locked decision 1), so the account is tied to a
 * `people` document built from the owner's record in the imported padrón, found by cédula; this
 * also gives the superadmin the birth date its password is checked against. When the owner already
 * has a person (e.g. the superadmin account was deleted to re-enroll a lost TOTP device), that
 * person is reused: one person per cédula, with their team intact.
 */

/** A refusal the command line prints as is (in Spanish, like the rest of the app's messages). */
export class SuperadminSetupError extends Error {
  override name = 'SuperadminSetupError';
}

const ALREADY_EXISTS = 'Ya existe un superadmin. Solo puede haber uno.';

/** Refuses when a superadmin exists. The unique partial index `one_superadmin` backs this up. */
export async function assertNoSuperadmin(): Promise<void> {
  if (await UserModel.exists({ role: 'superadmin' }))
    throw new SuperadminSetupError(ALREADY_EXISTS);
}

/** The owner as the padrón knows them: what their `people` document copies. */
export interface OwnerVoter {
  cedula: string;
  snapshot: VoterSnapshot;
  /** The owner's person when they already have one; null when the superadmin creates it. */
  existingPersonId: Types.ObjectId | null;
}

/**
 * The owner's record in the imported padrón. Refuses a cédula that is not an active voter (or a
 * database without voters: import the padrón first) and one that already has an account.
 */
export async function findOwnerVoter(cedula: string): Promise<OwnerVoter> {
  if (!(await VoterModel.exists({}))) {
    throw new SuperadminSetupError(
      'No hay votantes en la base de datos. Importe el padrón primero (voters:import --apply).',
    );
  }
  const voter = await VoterModel.findOne({ _id: cedula, status: 'active' }).lean();
  if (!voter) {
    throw new SuperadminSetupError('Esa cédula no está en el padrón activo de Higüey.');
  }
  if (await UserModel.exists({ username: cedula })) {
    throw new SuperadminSetupError('Esa cédula ya tiene una cuenta.');
  }
  const recinto = await RecintoModel.findById(voter.recintoKey).lean();
  if (!recinto) throw new Error(`Recinto ${voter.recintoKey} of an active voter does not exist`);
  const person = await PersonModel.findOne({ cedula }, { _id: 1 }).lean();
  return {
    cedula,
    existingPersonId: person?._id ?? null,
    snapshot: {
      fullName: voter.fullName,
      recintoKey: voter.recintoKey,
      recintoName: recinto.name,
      colegioId: voter.colegioId,
      sector: voter.sector,
      birthDate: voter.birthDate,
    },
  };
}

/** How to reach the owner: `people.phone` is required when the person is created. */
export interface OwnerContact {
  /** 10 digits (`phoneSchema`). */
  phone: string;
  phoneWhatsapp: boolean;
}

export interface NewSuperadmin {
  owner: OwnerVoter;
  /** Required when the owner has no person yet; ignored otherwise. */
  contact: OwnerContact | null;
  password: string;
  /** Base32; stored encrypted with `totpKey`. */
  totpSecret: string;
  /** The time step of the code typed at enrollment, so that code cannot also open a session. */
  totpStep: number;
}

/** The owner's person, at the top of the campaign structure: no leader, no ancestors. */
async function createOwnerPerson(
  owner: OwnerVoter,
  contact: OwnerContact | null,
  registeredBy: Types.ObjectId,
  session: ClientSession,
): Promise<Types.ObjectId> {
  if (!contact) throw new Error('A new person needs a phone number');
  const [person] = await PersonModel.create(
    [
      {
        cedula: owner.cedula,
        voterSnapshot: owner.snapshot,
        phone: contact.phone,
        phoneWhatsapp: contact.phoneWhatsapp,
        level: 'coordinator',
        leaderId: null,
        ancestors: [],
        registeredBy,
        docStatus: 'pending',
        consentAt: new Date(),
      },
    ],
    { session },
  );
  if (!person) throw new Error('Person was not created');
  return person._id;
}

function isSecondSuperadmin(err: unknown): boolean {
  return (
    err instanceof mongoose.mongo.MongoServerError &&
    err.code === 11000 &&
    (err.keyPattern as Record<string, unknown> | undefined)?.role !== undefined
  );
}

/**
 * Creates the superadmin: its person (unless the owner is already registered) and its account,
 * with a strong password and TOTP, in one audited transaction. Refuses a second superadmin, both
 * here and, against a concurrent run, through the unique index.
 */
export async function createSuperadmin(
  input: NewSuperadmin,
  totpKey: Buffer,
): Promise<UserDocument> {
  const { owner } = input;
  const problem = newPasswordProblem(input.password, 'superadmin', owner.snapshot.birthDate);
  if (problem) throw new SuperadminSetupError(problem);
  // The guarantee is the index, so it must exist before the insert; transactions cannot create
  // collections or indexes as they go.
  await Promise.all([UserModel.init(), PersonModel.init(), AuditLogModel.init()]);
  await assertNoSuperadmin();

  // Hashing is slow on purpose: do it before the transaction, which may be retried.
  const passwordHash = await hashPassword(input.password);
  const totpSecretEnc = encryptSecret(totpKey, input.totpSecret);
  // Chosen up front so a new person can be registered by the account being created.
  const userId = new Types.ObjectId();

  try {
    return await mongoose.connection.transaction(async (session) => {
      const personId =
        owner.existingPersonId ?? (await createOwnerPerson(owner, input.contact, userId, session));
      const [user] = await UserModel.create(
        [
          {
            _id: userId,
            personId,
            username: owner.cedula,
            passwordHash,
            role: 'superadmin',
            usingDefaultPassword: false,
            totpSecretEnc,
            totpLastUsedStep: input.totpStep,
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
          summary: `Creó la cuenta de superadmin de ${owner.cedula} desde la línea de comandos.`,
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
