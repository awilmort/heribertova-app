import type { Role } from '@heribertova/shared';
import { Types } from 'mongoose';
import { hashPassword } from '../src/lib/password';
import { PersonModel, type Person } from '../src/modules/people/model';
import { UserModel, type User, type UserDocument } from '../src/modules/users/model';

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

/** A login account plus the person behind it. The password is hashed like a real one. */
export async function createTestUser({
  password = DEFAULT_TEST_PASSWORD,
  role = 'general_coordinator',
  ...overrides
}: TestUserOptions = {}): Promise<UserDocument> {
  const cedula = overrides.username ?? uniqueCedula();
  // The id is chosen up front so the account can be the one that registered its own person.
  const userId = overrides._id ?? new Types.ObjectId();
  const person = await createTestPerson({ cedula, registeredBy: userId });
  return UserModel.create({
    _id: userId,
    personId: person._id,
    username: cedula,
    passwordHash: await testPasswordHash(password),
    role,
    usingDefaultPassword: true,
    ...overrides,
  });
}
