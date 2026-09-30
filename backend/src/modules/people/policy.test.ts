import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { RecintoModel } from '../recintos/model';
import type { RawVoterRecord } from '../voters/voterFile';
import { VoterModel, type Voter } from '../voters/model';
import { checkEligibility } from './policy';

useTestDatabase();

async function voterAt(records: RawVoterRecord[], index: number): Promise<Voter> {
  const voter = await VoterModel.findById(records[index]?.cedula).lean();
  if (!voter) throw new Error(`No voter at ${index}`);
  return voter;
}

describe('checkEligibility', () => {
  it('is eligible for an active voter not yet registered, with the padrón fields to prefill', async () => {
    const records = await importFakePadron(20);
    const voter = await voterAt(records, 0);
    const actor = await createTestUser();

    const result = await checkEligibility(voter._id, actor);

    expect(result).toMatchObject({
      eligible: true,
      fullName: voter.fullName,
      recintoKey: voter.recintoKey,
      colegioId: voter.colegioId,
      sector: voter.sector,
    });
  });

  it('flags a bad check digit as informational only, without blocking eligibility', async () => {
    // A cédula whose last digit does not match the Luhn check digit (§3.1: 87 real voters fail it).
    const cedula = '00112345670';
    await RecintoModel.create({
      _id: 'liceo--centro',
      name: 'LICEO',
      sector: 'CENTRO',
      colegios: [1],
      voterCount: 1,
    });
    await VoterModel.create({
      _id: cedula,
      firstNames: 'JUAN',
      lastName1: 'PÉREZ',
      lastName2: null,
      fullName: 'JUAN PÉREZ',
      searchName: 'juan perez',
      birthDate: '1990-01-01',
      birthMonth: 1,
      birthDay: 1,
      recintoKey: 'liceo--centro',
      colegioId: 1,
      sector: 'CENTRO',
      checkDigitValid: false,
      status: 'active',
      importId: new Types.ObjectId(),
    });

    const result = await checkEligibility(cedula, await createTestUser());

    expect(result).toMatchObject({ eligible: true, checkDigitValid: false });
  });

  it('is not eligible for a cédula outside the padrón', async () => {
    const result = await checkEligibility('99999999999', await createTestUser());
    expect(result).toEqual({
      eligible: false,
      code: 'not_a_voter',
      reason: 'Esta cédula no figura en el padrón de Higüey.',
    });
  });

  it('is not eligible for a voter no longer active in the current padrón', async () => {
    const records = await importFakePadron(20);
    const voter = await voterAt(records, 1);
    await VoterModel.updateOne({ _id: voter._id }, { status: 'inactive' });

    const result = await checkEligibility(voter._id, await createTestUser());

    expect(result).toMatchObject({ eligible: false, code: 'not_a_voter' });
  });

  it('is not eligible for someone already registered, without a leader name out of scope', async () => {
    const records = await importFakePadron(20);
    const voter = await voterAt(records, 2);
    await createTestPerson({
      cedula: voter._id,
      registeredBy: new Types.ObjectId(),
      leaderId: new Types.ObjectId(),
      voterSnapshot: {
        fullName: voter.fullName,
        recintoKey: voter.recintoKey,
        recintoName: 'RECINTO',
        colegioId: voter.colegioId,
        sector: voter.sector,
        birthDate: voter.birthDate,
      },
    });

    const result = await checkEligibility(voter._id, await createTestUser());

    expect(result).toMatchObject({ eligible: false, code: 'already_registered', leaderName: null });
  });

  it('shows the leader name when the caller is in scope of the already-registered person', async () => {
    const records = await importFakePadron(20);
    const voter = await voterAt(records, 3);
    const coordinator = await createTestUser({ role: 'general_coordinator' });
    const leader = await createTestPerson({ registeredBy: new Types.ObjectId() });
    await createTestPerson({
      cedula: voter._id,
      registeredBy: new Types.ObjectId(),
      leaderId: leader._id,
      ancestors: [leader._id],
      voterSnapshot: {
        fullName: voter.fullName,
        recintoKey: voter.recintoKey,
        recintoName: 'RECINTO',
        colegioId: voter.colegioId,
        sector: voter.sector,
        birthDate: voter.birthDate,
      },
    });

    const result = await checkEligibility(voter._id, coordinator);

    expect(result).toMatchObject({ eligible: false, leaderName: leader.voterSnapshot.fullName });
  });
});
