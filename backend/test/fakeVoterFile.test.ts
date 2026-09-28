import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasValidCheckDigit } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { parseVoterRecord, type StagedVoter } from '../src/modules/voters/voterFile';
import {
  generateFakeVoterRecords,
  REAL_FILE,
  voterFileChunks,
  writeFakeVoterFile,
} from './fakeVoterFile';

const REAL_KEYS = [
  'cedula',
  'nombres',
  'apellido1',
  'apellido2',
  'fechaNacimiento',
  'idProvincia',
  'descripcionProvincia',
  'idMunicipio',
  'descripcionMunicipio',
  'codigoCircunscripcion',
  'descripcionRecinto',
  'idColegio',
  'descripcionSector',
];

describe('generateFakeVoterRecords at the real size', () => {
  const records = [...generateFakeVoterRecords({ voters: REAL_FILE.voters })];
  const voters: StagedVoter[] = records.map((record) => {
    const parsed = parseVoterRecord(record);
    if (!parsed.ok) throw new Error(parsed.reasons.join('; '));
    return parsed.voter;
  });

  it('writes exactly the 13 keys of the real export, in order', () => {
    expect(records).toHaveLength(REAL_FILE.voters);
    expect(Object.keys(records[0] ?? {})).toEqual(REAL_KEYS);
    expect(records.every((r) => Object.keys(r).length === REAL_KEYS.length)).toBe(true);
  });

  it('produces unique cédulas that all pass validation', () => {
    expect(new Set(voters.map((v) => v._id)).size).toBe(REAL_FILE.voters);
  });

  it('reproduces the real structure: 110 recintos, 369 colegios, 80 sectors', () => {
    expect(new Set(voters.map((v) => v.recintoKey)).size).toBe(REAL_FILE.recintos);
    expect(new Set(voters.map((v) => v.colegioId)).size).toBe(REAL_FILE.colegios);
    expect(new Set(voters.map((v) => v.sector)).size).toBe(REAL_FILE.sectors);
  });

  it('puts every colegio in exactly one recinto, within the real id range', () => {
    const recintoOf = new Map<number, string>();
    for (const voter of voters) {
      expect(recintoOf.get(voter.colegioId) ?? voter.recintoKey).toBe(voter.recintoKey);
      recintoOf.set(voter.colegioId, voter.recintoKey);
      expect(voter.colegioId).toBeGreaterThanOrEqual(4675);
      expect(voter.colegioId).toBeLessThanOrEqual(17300);
    }
  });

  it('repeats "ESCUELA PRIMARIA RURAL" across 7 sectors (104 distinct recinto names)', () => {
    const sectors = new Set(
      voters.filter((v) => v.recintoName === 'ESCUELA PRIMARIA RURAL').map((v) => v.sector),
    );
    expect(sectors.size).toBe(7);
    expect(new Set(voters.map((v) => v.recintoName)).size).toBe(104);
  });

  it('writes two recinto names with stray spaces that normalize to the clean name', () => {
    const stray = new Set(
      records.map((r) => r.descripcionRecinto).filter((name) => /^\s|\s$|\s\s/.test(name)),
    );
    expect(stray.size).toBe(2);
  });

  it('has 87 bad check digits', () => {
    expect(records.filter((r) => !hasValidCheckDigit(r.cedula))).toHaveLength(
      REAL_FILE.badCheckDigits,
    );
  });

  it('has 84 voters over 100 and everyone 18+ at the May 2024 cut', () => {
    const overHundred = records.filter((r) => r.fechaNacimiento < '1924-05-19');
    expect(overHundred).toHaveLength(REAL_FILE.overHundred);
    expect(records.every((r) => r.fechaNacimiento >= '1901-01-01')).toBe(true);
    expect(records.every((r) => r.fechaNacimiento <= '2006-05-19')).toBe(true);
  });

  it('leaves apellido2 null for about 21.5 % of voters', () => {
    const share = records.filter((r) => r.apellido2 === null).length / records.length;
    expect(share).toBeGreaterThan(0.205);
    expect(share).toBeLessThan(0.225);
  });

  it('includes accented names, Ñ, Ü and the stray ´', () => {
    const names = records.map((r) => `${r.nombres} ${r.apellido1} ${r.apellido2 ?? ''}`);
    for (const mark of ['É', 'Á', 'Í', 'Ó', 'Ú', 'Ñ', 'Ü', '´']) {
      expect(names.some((name) => name.includes(mark))).toBe(true);
    }
  });

  it('uses one to five given names', () => {
    const counts = new Set(records.map((r) => r.nombres.split(' ').length));
    expect([...counts].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('generateFakeVoterRecords', () => {
  it('is deterministic for a seed and varies with it', () => {
    const a = [...generateFakeVoterRecords({ voters: 50, seed: 1 })];
    const b = [...generateFakeVoterRecords({ voters: 50, seed: 1 })];
    const c = [...generateFakeVoterRecords({ voters: 50, seed: 2 })];
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('scales the anomalies with the size', () => {
    const records = [...generateFakeVoterRecords({ voters: 20_000 })];
    // 20,000 × 87 / 181,551 ≈ 9.6 → 10
    expect(records.filter((r) => !hasValidCheckDigit(r.cedula))).toHaveLength(10);
  });
});

describe('voterFileChunks / writeFakeVoterFile', () => {
  it('serializes a JSON array, including an empty one', () => {
    expect(JSON.parse([...voterFileChunks([])].join(''))).toEqual([]);
    expect(JSON.parse([...voterFileChunks([{ a: 1 }, { a: 2 }])].join(''))).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it('writes a file that parses back to the generated records', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fake-voters-'));
    try {
      const path = join(dir, 'voters.json');
      await writeFakeVoterFile(path, { voters: 300 });
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      expect(parsed).toEqual([...generateFakeVoterRecords({ voters: 300 })]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
