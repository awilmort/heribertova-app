import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { generateFakeVoterRecords, voterFileChunks } from '../../../test/fakeVoterFile';
import { VoterModel } from '../voters/model';
import {
  connectOptionsFor,
  formatReport,
  parseImportArgs,
  PRINTED_REJECTED_ROWS,
  runVoterImport,
  sha256File,
  UsageError,
} from './cli';
import { VoterImportModel } from './model';
import type { RejectedRow, VoterImportReport } from './report';

useTestDatabase();

describe('parseImportArgs', () => {
  const cwd = '/home/owner';

  it('parses a dry run, resolving the file against cwd', () => {
    expect(parseImportArgs(['--file', 'padron.json', '--dry-run'], cwd)).toEqual({
      mode: 'dry-run',
      file: '/home/owner/padron.json',
    });
  });

  it('keeps an absolute file path', () => {
    expect(parseImportArgs(['--file', '/data/p.json', '--dry-run'], cwd).file).toBe('/data/p.json');
  });

  it('stages by default and applies with --apply, both with a trimmed cut', () => {
    expect(parseImportArgs(['--file', 'p.json', '--cut', ' mayo2024 '], cwd)).toEqual({
      mode: 'stage',
      file: '/home/owner/p.json',
      cut: 'mayo2024',
    });
    expect(parseImportArgs(['--file', 'p.json', '--cut', 'mayo2024', '--apply'], cwd)).toEqual({
      mode: 'apply',
      file: '/home/owner/p.json',
      cut: 'mayo2024',
    });
  });

  it('ignores a leading -- forwarded by pnpm', () => {
    expect(parseImportArgs(['--', '--file', 'p.json', '--dry-run'], cwd).mode).toBe('dry-run');
  });

  it.each([
    [[], '--file is required'],
    [['--dry-run'], '--file is required'],
    [['--file', 'p.json', '--dry-run', '--apply'], 'exclude each other'],
    [['--file', 'p.json'], '--cut is required'],
    [['--file', 'p.json', '--apply', '--cut', '  '], '--cut is required'],
    [['--file', 'p.json', '--dry-run', '--force'], "Unknown option '--force'"],
    [['--file', 'p.json', '--dry-run', 'extra'], 'extra'],
    [['--file'], "Option '--file <value>' argument missing"],
  ])('rejects %j', (argv, message) => {
    expect(() => parseImportArgs(argv, cwd)).toThrow(UsageError);
    expect(() => parseImportArgs(argv, cwd)).toThrow(message);
  });
});

describe('connectOptionsFor', () => {
  it('stops Mongoose from creating collections or indexes during a dry run', () => {
    expect(connectOptionsFor('dry-run')).toEqual({ autoCreate: false, autoIndex: false });
  });

  it('keeps the defaults when writing', () => {
    expect(connectOptionsFor('stage')).toEqual({});
    expect(connectOptionsFor('apply')).toEqual({});
  });
});

const EMPTY: VoterImportReport = {
  rows: 181_551,
  accepted: 181_551,
  rejected: { count: 0, samples: [] },
  warnings: { checkDigit: { count: 87, samples: [] } },
  totals: { recintos: 110, colegios: 369, sectors: 80 },
  diff: {
    newVoters: { count: 181_551, samples: [] },
    movedRecinto: { count: 0, samples: [] },
    movedColegio: { count: 0, samples: [] },
    missing: { count: 0, samples: [] },
    recintosAdded: ['a--b'],
    recintosRemoved: [],
  },
  source: [
    {
      idProvincia: 2,
      descripcionProvincia: 'LA ALTAGRACIA',
      idMunicipio: 28,
      descripcionMunicipio: 'HIGUEY',
      codigoCircunscripcion: '01',
    },
  ],
};

describe('formatReport', () => {
  it('prints the numbers the owner compares against the real file', () => {
    expect(formatReport(EMPTY)).toEqual([
      'Rows                  181,551',
      'Accepted              181,551',
      'Rejected              0',
      'Check-digit warnings  87',
      'Recintos              110',
      'Colegios              369',
      'Sectors               80',
      'Source                provincia 2 LA ALTAGRACIA · municipio 28 HIGUEY · circunscripción 01',
      'Diff against the current padrón:',
      '  new voters          181,551',
      '  moved recinto       0',
      '  moved colegio       0',
      '  missing (inactive)  0',
      '  recintos added      1',
      '  recintos removed    0',
    ]);
  });

  it('names removed recintos', () => {
    const report = { ...EMPTY, diff: { ...EMPTY.diff, recintosRemoved: ['x--y', 'z--w'] } };
    expect(formatReport(report)).toContain('  recintos removed    2 (x--y, z--w)');
  });

  it('prints rejected rows with masked cédulas, capped', () => {
    const samples: RejectedRow[] = Array.from({ length: PRINTED_REJECTED_ROWS + 5 }, (_, i) => ({
      row: i + 1,
      cedula: '00112345673',
      reasons: ['nombres: está vacío', 'apellido1: falta el campo'],
    }));
    samples[1] = {
      row: 2,
      cedula: null,
      reasons: ['el registro no es un objeto'],
    };
    samples[2] = { row: 3, cedula: '123', reasons: ['cedula: La cédula debe tener 11 dígitos.'] };
    const report = { ...EMPTY, rejected: { count: 40, samples } };

    const lines = formatReport(report);
    const header = lines.indexOf(`Rejected rows (first ${PRINTED_REJECTED_ROWS} of 40):`);
    expect(header).toBeGreaterThan(0);
    expect(lines.slice(header + 1, header + 4)).toEqual([
      '  row 1  001-*******-3  nombres: está vacío; apellido1: falta el campo',
      '  row 2  (no cédula)  el registro no es un objeto',
      '  row 3  123  cedula: La cédula debe tener 11 dígitos.',
    ]);
    expect(lines).toHaveLength(header + 1 + PRINTED_REJECTED_ROWS);
    expect(lines.join('\n')).not.toContain('00112345673');
  });
});

describe('runVoterImport', () => {
  let dir: string;
  let file: string;
  const SIZE = 1_200;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'voters-import-'));
    file = join(dir, 'voters.json');
    await writeFile(
      file,
      [...voterFileChunks(generateFakeVoterRecords({ voters: SIZE }))].join(''),
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function run(options: Parameters<typeof runVoterImport>[0]) {
    const lines: string[] = [];
    await runVoterImport(options, (line) => lines.push(line));
    return lines;
  }

  it('hashes the file content', async () => {
    const expected = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    expect(await sha256File(file)).toBe(expected);
  });

  it('dry run: prints the report and writes nothing', async () => {
    const lines = await run({ mode: 'dry-run', file });

    expect(lines[0]).toBe('Voter file voters.json');
    expect(lines[1]).toBe(`SHA-256    ${await sha256File(file)}`);
    expect(lines).toContain('Accepted              1,200');
    expect(lines.at(-1)).toBe('Dry run: nothing was written to the database.');
    expect(await VoterImportModel.countDocuments()).toBe(0);
    expect(await VoterModel.countDocuments()).toBe(0);
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    expect(names.filter((name) => name.startsWith('voters_staging_'))).toEqual([]);
  });

  it('stage: validates into staging and says how to apply', async () => {
    const lines = await run({ mode: 'stage', file, cut: 'mayo2024' });

    const record = await VoterImportModel.findOne().lean();
    expect(record?.status).toBe('staged');
    expect(record?.cut).toBe('mayo2024');
    expect(record?.fileName).toBe('voters.json');
    expect(lines).toContain('Rows                  1,200');
    expect(lines.at(-1)).toBe(
      `Staged as import ${record!._id.toHexString()}. Run again with --apply to apply it.`,
    );
    expect(await VoterModel.countDocuments()).toBe(0);
  });

  it('apply: stages and applies; running it again is a no-op', async () => {
    const first = await run({ mode: 'apply', file, cut: 'mayo2024' });
    const record = await VoterImportModel.findOne().lean();
    expect(first.at(-1)).toBe(
      `Applied import ${record!._id.toHexString()}: voters upserted, missing voters marked inactive, recintos rebuilt.`,
    );
    expect(await VoterModel.countDocuments({ status: 'active' })).toBe(SIZE);

    const second = await run({ mode: 'apply', file, cut: 'mayo2024' });
    expect(second.at(-1)).toBe(
      `Already applied as import ${record!._id.toHexString()} (${record!.appliedAt!.toISOString()}): nothing to do.`,
    );
    expect(await VoterImportModel.countDocuments()).toBe(1);
  });

  it('apply after stage: applies the staged import without staging again', async () => {
    await run({ mode: 'stage', file, cut: 'mayo2024' });
    const staged = await VoterImportModel.findOne().lean();

    await run({ mode: 'apply', file, cut: 'mayo2024' });

    const applied = await VoterImportModel.find().lean();
    expect(applied).toHaveLength(1);
    expect(applied[0]?._id.equals(staged!._id)).toBe(true);
    expect(applied[0]?.status).toBe('applied');
  });

  it('stage on an import interrupted while applying says how to finish it', async () => {
    await run({ mode: 'stage', file, cut: 'mayo2024' });
    await VoterImportModel.updateOne({}, { status: 'applying' });
    const record = await VoterImportModel.findOne().lean();

    const lines = await run({ mode: 'stage', file, cut: 'mayo2024' });

    expect(lines.at(-1)).toBe(
      `Import ${record!._id.toHexString()} was interrupted while applying. Run again with --apply to finish it.`,
    );
  });

  it('stage/apply: first recovers an import whose validation was interrupted', async () => {
    const stuck = await VoterImportModel.create({
      sha256: await sha256File(file),
      cut: 'mayo2024',
      fileName: 'voters.json',
      status: 'validating',
    });

    const lines = await run({ mode: 'apply', file, cut: 'mayo2024' });

    expect(lines[2]).toBe(
      `Marked import ${stuck.id} (voters.json) failed: its validation was interrupted.`,
    );
    const record = await VoterImportModel.findById(stuck._id).lean();
    expect(record?.status).toBe('applied');
  });

  it('dry run: leaves an interrupted import alone (writes nothing)', async () => {
    await VoterImportModel.create({
      sha256: await sha256File(file),
      cut: 'mayo2024',
      fileName: 'voters.json',
      status: 'validating',
    });

    await run({ mode: 'dry-run', file });

    expect((await VoterImportModel.findOne().lean())?.status).toBe('validating');
  });

  it('fails on a missing file', async () => {
    await expect(run({ mode: 'dry-run', file: join(dir, 'nope.json') })).rejects.toThrow('ENOENT');
  });
});
