import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { generateFakeVoterRecords, voterFileChunks } from '../../../test/fakeVoterFile';
import { collapseSpaces } from '../../lib/text';
import { PersonModel } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import { parseVoterRecord, type RawVoterRecord, type StagedVoter } from '../voters/voterFile';
import { VoterImportModel } from './model';
import {
  applyVoterImport,
  dryRunVoterFile,
  failInterruptedValidations,
  stageVoterFile,
  stagingCollectionName,
  STAGING_BATCH_SIZE,
} from './service';

useTestDatabase();

/** Crosses two batch boundaries and still uses all 110 recintos and 369 colegios. */
const SIZE = 2_500;
const BASE: readonly RawVoterRecord[] = [...generateFakeVoterRecords({ voters: SIZE })];

function mapped(record: unknown): StagedVoter {
  const parsed = parseVoterRecord(record);
  if (!parsed.ok) throw new Error(parsed.reasons.join('; '));
  return parsed.voter;
}

function voterFile(records: readonly unknown[]) {
  const text = [...voterFileChunks(records)].join('');
  return {
    openFile: () => Readable.from([Buffer.from(text, 'utf8')]),
    sha256: createHash('sha256').update(text).digest('hex'),
    text,
  };
}

async function stage(records: readonly unknown[], cut = 'mayo2024') {
  const { openFile, sha256 } = voterFile(records);
  return stageVoterFile({ openFile, sha256, cut, fileName: 'padron.json' });
}

async function stageAndApply(records: readonly unknown[]) {
  const staged = await stage(records);
  return applyVoterImport(staged._id);
}

/** A minimal registered member for `voter`, so a test can check `applyVoterImport`'s snapshot
 * refresh without going through the full registration flow (policy checks, leader resolution). */
async function registerTestPerson(voter: StagedVoter) {
  const someone = new Types.ObjectId();
  return PersonModel.create({
    cedula: voter._id,
    voterSnapshot: {
      fullName: voter.fullName,
      recintoKey: voter.recintoKey,
      recintoName: voter.recintoName,
      colegioId: voter.colegioId,
      sector: voter.sector,
      birthDate: voter.birthDate,
    },
    phone: '8095550000',
    phoneWhatsapp: true,
    level: 'member',
    registeredBy: someone,
    docStatus: 'pending',
    consentAt: new Date(),
  });
}

async function collectionNames(): Promise<string[]> {
  const collections = await mongoose.connection.db?.listCollections().toArray();
  return (collections ?? []).map((c) => c.name).sort();
}

/** Every document of every collection, to prove an operation wrote nothing. */
async function databaseSnapshot() {
  const snapshot: Record<string, unknown[]> = {};
  for (const name of await collectionNames()) {
    snapshot[name] = await mongoose.connection
      .db!.collection(name)
      .find()
      .sort({ _id: 1 })
      .toArray();
  }
  return snapshot;
}

/**
 * A second padrón cut derived from BASE: one recinto disappears, 3 voters move recinto, 2 move
 * colegio within their recinto and 4 voters are new.
 */
function secondCut() {
  const voters = BASE.map(mapped);
  const removedRecinto = voters[0]!.recintoKey;

  const colegiosByRecinto = new Map<string, Set<number>>();
  for (const v of voters) {
    const set = colegiosByRecinto.get(v.recintoKey) ?? new Set();
    colegiosByRecinto.set(v.recintoKey, set.add(v.colegioId));
  }
  const multiColegio = [...colegiosByRecinto].find(
    ([key, colegios]) => key !== removedRecinto && colegios.size >= 2,
  )!;
  const [otherColegio] = [...multiColegio[1]];
  const target = BASE.find(
    (r) => mapped(r).recintoKey !== removedRecinto && mapped(r).recintoKey !== multiColegio[0],
  )!;
  const targetKey = mapped(target).recintoKey;

  const movedRecinto: string[] = [];
  const movedColegio: string[] = [];
  const records: RawVoterRecord[] = [];
  for (const [i, record] of BASE.entries()) {
    const voter = voters[i]!;
    if (voter.recintoKey === removedRecinto) continue;
    if (movedRecinto.length < 3 && voter.recintoKey !== targetKey) {
      movedRecinto.push(voter._id);
      records.push({
        ...record,
        descripcionRecinto: target.descripcionRecinto,
        descripcionSector: target.descripcionSector,
        idColegio: target.idColegio,
      });
      continue;
    }
    if (
      movedColegio.length < 2 &&
      voter.recintoKey === multiColegio[0] &&
      voter.colegioId !== otherColegio
    ) {
      movedColegio.push(voter._id);
      records.push({ ...record, idColegio: otherColegio! });
      continue;
    }
    records.push(record);
  }
  const newRecords = [...generateFakeVoterRecords({ voters: SIZE + 4 })].slice(SIZE);
  records.push(...newRecords);

  return {
    records,
    removedRecinto,
    removedVoters: voters.filter((v) => v.recintoKey === removedRecinto).map((v) => v._id),
    movedRecinto,
    movedColegio,
    newVoters: newRecords.map((r) => r.cedula),
  };
}

describe('dryRunVoterFile', () => {
  it('reports a clean first import', async () => {
    const report = await dryRunVoterFile(voterFile(BASE).openFile);

    expect(report).toMatchObject({
      rows: SIZE,
      accepted: SIZE,
      rejected: { count: 0, samples: [] },
      totals: { recintos: 110, colegios: 369, sectors: 80 },
      source: [
        {
          idProvincia: 2,
          descripcionProvincia: 'LA ALTAGRACIA',
          idMunicipio: 28,
          descripcionMunicipio: 'HIGUEY',
          codigoCircunscripcion: '01',
        },
      ],
    });
    expect(report.diff.newVoters.count).toBe(SIZE);
    expect(report.diff.missing.count).toBe(0);
    expect(report.diff.recintosAdded).toHaveLength(110);
    expect(report.diff.recintosRemoved).toEqual([]);
    const badCheckDigits = BASE.map(mapped)
      .filter((v) => !v.checkDigitValid)
      .map((v) => v._id);
    expect(badCheckDigits.length).toBeGreaterThan(0);
    expect(report.warnings.checkDigit).toEqual({
      count: badCheckDigits.length,
      samples: badCheckDigits,
    });
  });

  it('rejects bad rows with their row number and reasons, accepting the rest', async () => {
    const records: unknown[] = [...BASE];
    const withoutApellido1: Partial<RawVoterRecord> = { ...BASE[6] };
    delete withoutApellido1.apellido1;
    records[5] = { ...BASE[5], cedula: '123' };
    records[6] = withoutApellido1;
    records[7] = 'not a record';
    records[8] = { ...BASE[8], cedula: BASE[0]!.cedula };
    records[9] = { ...BASE[9], fechaNacimiento: '1990-02-30' };

    const report = await dryRunVoterFile(voterFile(records).openFile);

    expect(report.rows).toBe(SIZE);
    expect(report.accepted).toBe(SIZE - 5);
    expect(report.rejected).toEqual({
      count: 5,
      samples: [
        { row: 6, cedula: '123', reasons: ['cedula: La cédula debe tener 11 dígitos.'] },
        { row: 7, cedula: BASE[6]!.cedula, reasons: ['apellido1: falta el campo'] },
        { row: 8, cedula: null, reasons: ['el registro no es un objeto'] },
        { row: 9, cedula: BASE[0]!.cedula, reasons: ['cedula: repetida en el archivo'] },
        {
          row: 10,
          cedula: BASE[9]!.cedula,
          reasons: ['fechaNacimiento: debe ser una fecha AAAA-MM-DD válida'],
        },
      ],
    });
  });

  it('reports the diff against the current padrón', async () => {
    await stageAndApply(BASE);
    const cut = secondCut();

    const report = await dryRunVoterFile(voterFile(cut.records).openFile);

    expect(report.diff.newVoters).toEqual({ count: 4, samples: cut.newVoters });
    expect(report.diff.movedRecinto).toEqual({ count: 3, samples: cut.movedRecinto });
    expect(report.diff.movedColegio).toEqual({ count: 2, samples: cut.movedColegio });
    expect(report.diff.missing.count).toBe(cut.removedVoters.length);
    expect(new Set(report.diff.missing.samples)).toEqual(
      new Set(cut.removedVoters.slice(0, report.diff.missing.samples.length)),
    );
    expect(report.diff.recintosAdded).toEqual([]);
    expect(report.diff.recintosRemoved).toEqual([cut.removedRecinto]);
    expect(report.totals.recintos).toBe(109);
  });

  it('writes nothing to the database', async () => {
    await stageAndApply(BASE);
    const before = await databaseSnapshot();

    const records: unknown[] = [...secondCut().records, 'bad row'];
    const report = await dryRunVoterFile(voterFile(records).openFile);

    expect(report.rejected.count).toBe(1);
    expect(await databaseSnapshot()).toEqual(before);
  });

  it('rejects a file that is not a JSON array', async () => {
    const openFile = () => Readable.from([Buffer.from('{"cedula":"00112345673"}')]);
    await expect(dryRunVoterFile(openFile)).rejects.toThrow();
  });
});

describe('stageVoterFile', () => {
  it('stages accepted voters and saves the report on a staged record', async () => {
    const records: unknown[] = [...BASE, { cedula: 'bad' }];
    const { openFile, sha256 } = voterFile(records);
    const dryRun = await dryRunVoterFile(openFile);

    const record = await stageVoterFile({
      openFile,
      sha256,
      cut: ' mayo2024 ',
      fileName: 'padron.json',
    });

    expect(record.status).toBe('staged');
    expect(record.toObject()).toMatchObject({
      cut: 'mayo2024',
      fileName: 'padron.json',
      sha256,
      s3Key: null,
      uploadedBy: null,
      failureReason: null,
      appliedAt: null,
    });
    expect(record.report).toEqual(dryRun);
    const saved = await VoterImportModel.findById(record._id).lean();
    expect(saved?.report).toEqual(dryRun);

    const staging = mongoose.connection.db!.collection<StagedVoter>(
      stagingCollectionName(record._id),
    );
    expect(await staging.countDocuments()).toBe(SIZE);
    expect(await staging.findOne({ _id: BASE[0]!.cedula })).toEqual(mapped(BASE[0]));
    expect(await VoterModel.countDocuments()).toBe(0);
    expect(await RecintoModel.countDocuments()).toBe(0);
  });

  it('keeps the S3 key and uploader when given', async () => {
    const { openFile, sha256 } = voterFile(BASE.slice(0, 10));
    const uploadedBy = new Types.ObjectId();
    const record = await stageVoterFile({
      openFile,
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
      s3Key: 'imports/abc.json',
      uploadedBy,
    });
    expect(record.s3Key).toBe('imports/abc.json');
    expect(record.uploadedBy?.equals(uploadedBy)).toBe(true);
  });

  it('batches inserts by STAGING_BATCH_SIZE', async () => {
    const insertMany = vi.spyOn(mongoose.mongo.Collection.prototype, 'insertMany');
    try {
      await stage(BASE);
      const sizes = insertMany.mock.calls.map((call) => (call[0] as readonly StagedVoter[]).length);
      expect(sizes).toEqual([
        STAGING_BATCH_SIZE,
        STAGING_BATCH_SIZE,
        SIZE - 2 * STAGING_BATCH_SIZE,
      ]);
    } finally {
      insertMany.mockRestore();
    }
  });

  it('returns the existing record without reading the file again (same SHA-256)', async () => {
    const first = await stage(BASE);
    const { sha256 } = voterFile(BASE);
    const openFile = vi.fn();

    const again = await stageVoterFile({ openFile, sha256, cut: 'otro', fileName: 'copia.json' });

    expect(again._id.equals(first._id)).toBe(true);
    expect(again.status).toBe('staged');
    expect(again.cut).toBe('mayo2024');
    expect(openFile).not.toHaveBeenCalled();
    expect(await VoterImportModel.countDocuments()).toBe(1);
  });

  it('refuses a file whose import is still being validated', async () => {
    const { sha256 } = voterFile(BASE);
    await VoterImportModel.create({
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
      status: 'validating',
    });
    const openFile = vi.fn();

    await expect(
      stageVoterFile({ openFile, sha256, cut: 'mayo2024', fileName: 'padron.json' }),
    ).rejects.toThrow('still being validated');
    expect(openFile).not.toHaveBeenCalled();
  });

  it('marks the import failed and drops the staging rows when the file breaks midway', async () => {
    const { text, sha256 } = voterFile(BASE);
    const truncated = () => Readable.from([Buffer.from(text.slice(0, -200), 'utf8')]);

    await expect(
      stageVoterFile({ openFile: truncated, sha256, cut: 'mayo2024', fileName: 'padron.json' }),
    ).rejects.toThrow();

    const record = await VoterImportModel.findOne({ sha256 });
    expect(record?.status).toBe('failed');
    expect(record?.failureReason).toEqual(expect.any(String));
    expect(record?.report).toBeNull();
    expect(await collectionNames()).not.toContain(stagingCollectionName(record!._id));
  });

  it('stages a failed file again from scratch on the same record', async () => {
    const { text, openFile, sha256 } = voterFile(BASE);
    const truncated = () => Readable.from([Buffer.from(text.slice(0, -200), 'utf8')]);
    await expect(
      stageVoterFile({ openFile: truncated, sha256, cut: 'mayo2024', fileName: 'padron.json' }),
    ).rejects.toThrow();

    const record = await stageVoterFile({
      openFile,
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
    });

    expect(record.status).toBe('staged');
    expect(record.failureReason).toBeNull();
    expect(record.report?.accepted).toBe(SIZE);
    expect(await VoterImportModel.countDocuments()).toBe(1);
    const staging = mongoose.connection.db!.collection(stagingCollectionName(record._id));
    expect(await staging.countDocuments()).toBe(SIZE);
  });
});

describe('failInterruptedValidations', () => {
  it('fails validating imports, drops their staging rows and lets the file be staged again', async () => {
    const { openFile, sha256 } = voterFile(BASE);
    const stuck = await VoterImportModel.create({
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
      status: 'validating',
    });
    const staging = mongoose.connection.db!.collection<{ _id: string }>(
      stagingCollectionName(stuck._id),
    );
    await staging.insertOne({ _id: 'partial' });

    const failed = await failInterruptedValidations();

    expect(failed.map((r) => r.id)).toEqual([stuck.id]);
    const saved = await VoterImportModel.findById(stuck._id).lean();
    expect(saved?.status).toBe('failed');
    expect(saved?.failureReason).toBe('Validation was interrupted before it finished');
    expect(await collectionNames()).not.toContain(stagingCollectionName(stuck._id));

    const restaged = await stageVoterFile({
      openFile,
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
    });
    expect(restaged._id.equals(stuck._id)).toBe(true);
    expect(restaged.status).toBe('staged');
  });

  it('leaves imports in every other state alone', async () => {
    const staged = await stage(BASE.slice(0, 10));
    const applied = await stageAndApply(BASE.slice(0, 20));
    const applying = await stage(BASE.slice(0, 30));
    await VoterImportModel.updateOne({ _id: applying._id }, { status: 'applying' });

    expect(await failInterruptedValidations()).toEqual([]);
    const statuses = await VoterImportModel.find().sort({ createdAt: 1 }).lean();
    expect(statuses.map((r) => [r._id.toHexString(), r.status])).toEqual([
      [staged.id, 'staged'],
      [applied.id, 'applied'],
      [applying.id, 'applying'],
    ]);
    const staging = mongoose.connection.db!.collection(stagingCollectionName(staged._id));
    expect(await staging.countDocuments()).toBe(10);
  });
});

describe('applyVoterImport', () => {
  it('loads voters, rebuilds recintos and drops the staging collection', async () => {
    const staged = await stage(BASE);
    const applied = await applyVoterImport(staged._id);

    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).toBeInstanceOf(Date);
    expect((await VoterImportModel.findById(staged._id))?.status).toBe('applied');
    expect(await collectionNames()).not.toContain(stagingCollectionName(staged._id));

    expect(await VoterModel.countDocuments({ status: 'active', importId: staged._id })).toBe(SIZE);
    const expected: Partial<StagedVoter> = mapped(BASE[0]);
    delete expected.recintoName;
    const { updatedAt, ...stored } = (await VoterModel.findById(BASE[0]!.cedula).lean())!;
    expect(updatedAt).toBeInstanceOf(Date);
    expect(stored).toEqual({ ...expected, status: 'active', importId: staged._id });
  });

  it('builds one recinto per name and sector with sorted colegios and voter counts', async () => {
    await stageAndApply(BASE);
    const voters = BASE.map(mapped);
    const recintos = await RecintoModel.find().lean();

    expect(recintos).toHaveLength(110);
    expect(recintos.reduce((sum, r) => sum + r.voterCount, 0)).toBe(SIZE);
    expect(new Set(recintos.flatMap((r) => r.colegios)).size).toBe(369);
    for (const recinto of recintos) {
      const own = voters.filter((v) => v.recintoKey === recinto._id);
      expect(recinto.voterCount).toBe(own.length);
      expect(recinto.colegios).toEqual(
        [...new Set(own.map((v) => v.colegioId))].sort((a, b) => a - b),
      );
      expect(recinto.name).toBe(collapseSpaces(recinto.name));
      expect(recinto.sector).toBe(own[0]!.sector);
    }
    const rural = recintos.filter((r) => r.name === 'ESCUELA PRIMARIA RURAL');
    expect(rural).toHaveLength(7);
    expect(rural.every((r) => r._id.startsWith('escuela-primaria-rural--'))).toBe(true);
  });

  it('applies a second cut: updates moved voters, deactivates missing ones, rebuilds recintos', async () => {
    await stageAndApply(BASE);
    const cut = secondCut();
    const second = await stageAndApply(cut.records);

    const activeExpected = SIZE - cut.removedVoters.length + 4;
    expect(await VoterModel.countDocuments({ status: 'active' })).toBe(activeExpected);
    expect(await VoterModel.countDocuments({ status: 'active', importId: second._id })).toBe(
      activeExpected,
    );
    expect(await VoterModel.countDocuments({ status: 'inactive' })).toBe(cut.removedVoters.length);
    // Never deleted: every voter ever imported is still there.
    expect(await VoterModel.countDocuments()).toBe(SIZE + 4);
    const removed = await VoterModel.find({ _id: { $in: cut.removedVoters } }).lean();
    expect(removed.every((v) => v.status === 'inactive')).toBe(true);

    const moved = await VoterModel.find({ _id: { $in: cut.movedRecinto } }).lean();
    const targetKey = mapped(cut.records.find((r) => r.cedula === cut.movedRecinto[0])).recintoKey;
    expect(moved.every((v) => v.recintoKey === targetKey)).toBe(true);

    const recintoKeys = (await RecintoModel.find().lean()).map((r) => r._id);
    expect(recintoKeys).toHaveLength(109);
    expect(recintoKeys).not.toContain(cut.removedRecinto);
    const counted = (await RecintoModel.find().lean()).reduce((sum, r) => sum + r.voterCount, 0);
    expect(counted).toBe(activeExpected);
  });

  it("refreshes a moved member's voterSnapshot, but leaves a now-missing member's snapshot alone", async () => {
    await stageAndApply(BASE);
    const cut = secondCut();

    const movedVoter = mapped(BASE.find((r) => r.cedula === cut.movedRecinto[0]));
    const movedPerson = await registerTestPerson(movedVoter);
    const missingVoter = mapped(BASE.find((r) => r.cedula === cut.removedVoters[0]));
    const missingPerson = await registerTestPerson(missingVoter);

    await stageAndApply(cut.records);

    const expectedNew = mapped(cut.records.find((r) => r.cedula === cut.movedRecinto[0]));
    const refreshed = await PersonModel.findById(movedPerson._id).lean();
    expect(refreshed?.voterSnapshot).toEqual({
      fullName: expectedNew.fullName,
      recintoKey: expectedNew.recintoKey,
      recintoName: expectedNew.recintoName,
      colegioId: expectedNew.colegioId,
      sector: expectedNew.sector,
      birthDate: expectedNew.birthDate,
    });
    // Every other field is left exactly as it was: the pipeline only ever touches voterSnapshot.
    expect(refreshed?.phone).toBe('8095550000');

    // The voter is now inactive (absent from the new cut): there is no fresher data for them, so
    // their last-known snapshot (their old recinto) is left in place, not cleared or stale-erased.
    const untouched = await PersonModel.findById(missingPerson._id).lean();
    expect(untouched?.voterSnapshot.recintoKey).toBe(missingVoter.recintoKey);
  });

  it('reactivates voters who come back in a later cut and reports them as new', async () => {
    await stageAndApply(BASE);
    const cut = secondCut();
    await stageAndApply(cut.records);

    const comeback = [...BASE, ...cut.records.slice(-4)];
    const staged = await stage(comeback);
    expect(staged.report?.diff.newVoters.count).toBe(cut.removedVoters.length);
    await applyVoterImport(staged._id);

    expect(await VoterModel.countDocuments({ status: 'inactive' })).toBe(0);
    expect(await RecintoModel.countDocuments()).toBe(110);
  });

  it('is a no-op for an applied import (re-importing the same file changes nothing)', async () => {
    const applied = await stageAndApply(BASE);
    const before = await databaseSnapshot();

    const again = await stage(BASE);
    expect(again._id.equals(applied._id)).toBe(true);
    expect(again.status).toBe('applied');
    await applyVoterImport(again._id);

    expect(await databaseSnapshot()).toEqual(before);
  });

  it('finishes an import interrupted while applying', async () => {
    const staged = await stage(BASE);
    await VoterImportModel.updateOne({ _id: staged._id }, { status: 'applying' });

    const applied = await applyVoterImport(staged._id);

    expect(applied.status).toBe('applied');
    expect(await VoterModel.countDocuments({ status: 'active' })).toBe(SIZE);
  });

  it('refuses an unknown import', async () => {
    await expect(applyVoterImport(new Types.ObjectId())).rejects.toThrow('not found');
  });

  it('refuses an import that is not staged', async () => {
    const { sha256 } = voterFile(BASE);
    const failed = await VoterImportModel.create({
      sha256,
      cut: 'mayo2024',
      fileName: 'padron.json',
      status: 'failed',
    });
    await expect(applyVoterImport(failed._id)).rejects.toThrow(
      'only a staged import can be applied',
    );
  });

  it('refuses an import without accepted voters, which would empty the padrón', async () => {
    await stageAndApply(BASE);
    const staged = await stage([{ cedula: 'bad' }]);
    expect(staged.report?.accepted).toBe(0);

    await expect(applyVoterImport(staged._id)).rejects.toThrow('no accepted voters');
    expect(await VoterModel.countDocuments({ status: 'active' })).toBe(SIZE);
  });

  it('refuses to apply when the staging collection does not match the report', async () => {
    const staged = await stage(BASE);
    await mongoose.connection.db!.collection(stagingCollectionName(staged._id)).deleteOne({});

    await expect(applyVoterImport(staged._id)).rejects.toThrow(`${SIZE - 1} staged voters`);
    expect(await VoterModel.countDocuments()).toBe(0);
  });
});
