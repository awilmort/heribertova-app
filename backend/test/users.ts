import type { Role } from '@heribertova/shared';
import { Types } from 'mongoose';
import { hashPassword } from '../src/lib/password';
import { encryptSecret } from '../src/lib/secretBox';
import { PersonModel, type Person } from '../src/modules/people/model';
import { UserModel, type User, type UserDocument } from '../src/modules/users/model';
import { TEST_TOTP_KEY, TEST_TOTP_SECRET } from './totp';

let nextCedula = 40_200_000_000;

/** A distinct 11-digit cédula per call. */
export function uniqueCedula(): string {
  nextCedula += 1;
  return String(nextCedula);
}

/** A registered person as the people API would store them (it arrives in plan 5.1). */
export function createTestPerson(overrides: Partial<Person> & { registeredBy: Types.ObjectId }) {
  return PersonModel.create({
    cedula: uniqueCedula(),
    voterSnapshot: {
      fullName: 'JUAN PÉREZ SANTANA',
      recintoKey: 'liceo-juan-pablo-duarte--centro-ciudad',
      recintoName: 'LICEO JUAN PABLO DUARTE',
      colegioId: 4675,
      sector: 'CENTRO CIUDAD',
      birthDate: '1985-03-15',
    },
    phone: '8095551234',
    phoneWhatsapp: true,
    level: 'coordinator',
    docStatus: 'pending',
    consentAt: new Date(),
    ...overrides,
  });
}

export interface TestUserOptions extends Partial<Omit<User, 'passwordHash'>> {
  role?: Role;
  password?: string;
}

export const DEFAULT_TEST_PASSWORD = '15031985';

/** argon2 is slow on purpose: hash each test password once per test file and reuse it. */
const hashes = new Map<string, Promise<string>>();

function testPasswordHash(password: string): Promise<string> {
  let hash = hashes.get(password);
  if (!hash) {
    hash = hashPassword(password);
    hashes.set(password, hash);
  }
  return hash;
}

/**
 * A login account for an existing person. The password is hashed like a real one; a superadmin
 * gets TEST_TOTP_SECRET, encrypted with the test app's key.
 */
export async function createTestLogin(
  person: Pick<Person, '_id' | 'cedula'>,
  {
    password = DEFAULT_TEST_PASSWORD,
    role = 'general_coordinator',
    ...overrides
  }: TestUserOptions = {},
): Promise<UserDocument> {
  return UserModel.create({
    personId: person._id,
    username: person.cedula,
    passwordHash: await testPasswordHash(password),
    role,
    usingDefaultPassword: true,
    totpSecretEnc: role === 'superadmin' ? encryptSecret(TEST_TOTP_KEY, TEST_TOTP_SECRET) : null,
    ...overrides,
  });
}

/** A login account plus the person behind it. */
export async function createTestUser(options: TestUserOptions = {}): Promise<UserDocument> {
  const cedula = options.username ?? uniqueCedula();
  // The id is chosen up front so the account can be the one that registered its own person.
  const userId = options._id ?? new Types.ObjectId();
  const person = await createTestPerson({ cedula, registeredBy: userId });
  return createTestLogin(person, { ...options, _id: userId });
}
