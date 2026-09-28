import { describe, expect, it } from 'vitest';
import type { StagedVoter, VoterFileSource } from '../voters/voterFile';
import {
  countWithSamples,
  DIFF_SAMPLE_LIMIT,
  ROW_SAMPLE_LIMIT,
  VoterImportReportBuilder,
} from './report';

const HIGUEY: VoterFileSource = {
  idProvincia: 2,
  descripcionProvincia: 'LA ALTAGRACIA',
  idMunicipio: 28,
  descripcionMunicipio: 'HIGUEY',
  codigoCircunscripcion: '01',
};

function voter(overrides: Partial<StagedVoter> = {}): StagedVoter {
  return {
    _id: '00112345673',
    firstNames: 'ANA',
    lastName1: 'DIAZ',
    lastName2: null,
    fullName: 'ANA DIAZ',
    searchName: 'ana diaz',
    birthDate: '1990-05-06',
    birthMonth: 5,
    birthDay: 6,
    recintoKey: 'liceo--centro',
    recintoName: 'LICEO',
    colegioId: 5000,
    sector: 'CENTRO',
    checkDigitValid: true,
    ...overrides,
  };
}

const NONE = { count: 0, samples: [] };

async function* iterate(items: string[]) {
  for (const item of items) yield await Promise.resolve(item);
}

describe('VoterImportReportBuilder', () => {
  it('reports an empty file', () => {
    expect(new VoterImportReportBuilder().build(NONE, [])).toEqual({
      rows: 0,
      accepted: 0,
      rejected: NONE,
      warnings: { checkDigit: NONE },
      totals: { recintos: 0, colegios: 0, sectors: 0 },
      diff: {
        newVoters: NONE,
        movedRecinto: NONE,
        movedColegio: NONE,
        missing: NONE,
        recintosAdded: [],
        recintosRemoved: [],
      },
      source: [],
    });
  });

  it('counts rows as accepted plus rejected and keeps rejected rows with reasons', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(voter(), HIGUEY, undefined);
    builder.reject({ row: 2, cedula: null, reasons: ['el registro no es un objeto'] });
    builder.reject({ row: 3, cedula: '1', reasons: ['cedula: x', 'nombres: y'] });

    const report = builder.build(NONE, []);
    expect(report.rows).toBe(3);
    expect(report.accepted).toBe(1);
    expect(report.rejected).toEqual({
      count: 2,
      samples: [
        { row: 2, cedula: null, reasons: ['el registro no es un objeto'] },
        { row: 3, cedula: '1', reasons: ['cedula: x', 'nombres: y'] },
      ],
    });
  });

  it('keeps an exact rejected count but only the first ROW_SAMPLE_LIMIT rows', () => {
    const builder = new VoterImportReportBuilder();
    for (let row = 1; row <= ROW_SAMPLE_LIMIT + 5; row++) {
      builder.reject({ row, cedula: null, reasons: ['x'] });
    }
    const { rejected } = builder.build(NONE, []);
    expect(rejected.count).toBe(ROW_SAMPLE_LIMIT + 5);
    expect(rejected.samples).toHaveLength(ROW_SAMPLE_LIMIT);
    expect(rejected.samples.at(-1)?.row).toBe(ROW_SAMPLE_LIMIT);
  });

  it('warns about bad check digits without rejecting', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(voter({ _id: '00112345670', checkDigitValid: false }), HIGUEY, undefined);
    builder.accept(voter({ _id: '00112345673' }), HIGUEY, undefined);
    const report = builder.build(NONE, []);
    expect(report.accepted).toBe(2);
    expect(report.warnings.checkDigit).toEqual({ count: 1, samples: ['00112345670'] });
  });

  it('counts distinct recintos, colegios and sectors', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(
      voter({ _id: '1', recintoKey: 'a--s1', colegioId: 1, sector: 'S1' }),
      HIGUEY,
      undefined,
    );
    builder.accept(
      voter({ _id: '2', recintoKey: 'a--s1', colegioId: 2, sector: 'S1' }),
      HIGUEY,
      undefined,
    );
    builder.accept(
      voter({ _id: '3', recintoKey: 'a--s2', colegioId: 3, sector: 'S2' }),
      HIGUEY,
      undefined,
    );
    builder.accept(
      voter({ _id: '4', recintoKey: 'a--s2', colegioId: 3, sector: 'S2' }),
      HIGUEY,
      undefined,
    );
    expect(builder.build(NONE, []).totals).toEqual({ recintos: 2, colegios: 3, sectors: 2 });
  });

  it('classifies each voter against where it is today', () => {
    const builder = new VoterImportReportBuilder();
    const today = { recintoKey: 'liceo--centro', colegioId: 5000 };
    builder.accept(voter({ _id: 'new' }), HIGUEY, undefined);
    builder.accept(voter({ _id: 'same' }), HIGUEY, today);
    builder.accept(
      voter({ _id: 'recinto', recintoKey: 'otro--centro', colegioId: 6000 }),
      HIGUEY,
      today,
    );
    builder.accept(voter({ _id: 'colegio', colegioId: 5001 }), HIGUEY, today);

    const { diff } = builder.build({ count: 1, samples: ['gone'] }, []);
    expect(diff.newVoters).toEqual({ count: 1, samples: ['new'] });
    expect(diff.movedRecinto).toEqual({ count: 1, samples: ['recinto'] });
    expect(diff.movedColegio).toEqual({ count: 1, samples: ['colegio'] });
    expect(diff.missing).toEqual({ count: 1, samples: ['gone'] });
  });

  it('keeps an exact diff count but only DIFF_SAMPLE_LIMIT samples', () => {
    const builder = new VoterImportReportBuilder();
    for (let i = 0; i < DIFF_SAMPLE_LIMIT + 3; i++)
      builder.accept(voter({ _id: `v${i}` }), HIGUEY, undefined);
    const { newVoters } = builder.build(NONE, []).diff;
    expect(newVoters.count).toBe(DIFF_SAMPLE_LIMIT + 3);
    expect(newVoters.samples).toHaveLength(DIFF_SAMPLE_LIMIT);
  });

  it('lists recintos added and removed, sorted', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(voter({ _id: '1', recintoKey: 'z--new' }), HIGUEY, undefined);
    builder.accept(voter({ _id: '2', recintoKey: 'kept--s' }), HIGUEY, undefined);
    builder.accept(voter({ _id: '3', recintoKey: 'a--new' }), HIGUEY, undefined);
    const { diff } = builder.build(NONE, ['kept--s', 'y--gone', 'b--gone']);
    expect(diff.recintosAdded).toEqual(['a--new', 'z--new']);
    expect(diff.recintosRemoved).toEqual(['b--gone', 'y--gone']);
  });

  it('keeps each distinct combination of the constant source fields once', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(voter({ _id: '1' }), HIGUEY, undefined);
    builder.accept(voter({ _id: '2' }), { ...HIGUEY }, undefined);
    builder.accept(voter({ _id: '3' }), { ...HIGUEY, codigoCircunscripcion: '02' }, undefined);
    expect(builder.build(NONE, []).source).toEqual([
      HIGUEY,
      { ...HIGUEY, codigoCircunscripcion: '02' },
    ]);
  });

  it('returns a report detached from the builder', () => {
    const builder = new VoterImportReportBuilder();
    builder.accept(voter({ _id: '1' }), HIGUEY, undefined);
    const first = builder.build(NONE, []);
    builder.accept(voter({ _id: '2' }), HIGUEY, undefined);
    expect(first.diff.newVoters).toEqual({ count: 1, samples: ['1'] });
  });
});

describe('countWithSamples', () => {
  it('counts everything and samples the first DIFF_SAMPLE_LIMIT', async () => {
    const items = Array.from({ length: DIFF_SAMPLE_LIMIT + 7 }, (_, i) => `c${i}`);
    const result = await countWithSamples(iterate(items));
    expect(result.count).toBe(DIFF_SAMPLE_LIMIT + 7);
    expect(result.samples).toEqual(items.slice(0, DIFF_SAMPLE_LIMIT));
  });

  it('handles an empty sequence', async () => {
    expect(await countWithSamples(iterate([]))).toEqual(NONE);
  });
});
