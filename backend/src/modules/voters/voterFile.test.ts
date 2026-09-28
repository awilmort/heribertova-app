import { describe, expect, it } from 'vitest';
import {
  HIGUEY_MUNICIPIO_ID,
  isCalendarDate,
  parseVoterRecord,
  recintoKeyOf,
  type ParsedVoterRecord,
} from './voterFile';

/** A record exactly as the real export writes it (13 keys, UPPERCASE text). */
function rawRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cedula: '00112345673',
    nombres: 'JUAN CARLOS',
    apellido1: 'PEREZ',
    apellido2: 'RODRIGUEZ',
    fechaNacimiento: '1985-07-14',
    idProvincia: 2,
    descripcionProvincia: 'LA ALTAGRACIA',
    idMunicipio: 28,
    descripcionMunicipio: 'HIGUEY',
    codigoCircunscripcion: '01',
    descripcionRecinto: 'LICEO JUAN PABLO DUARTE',
    idColegio: 4675,
    descripcionSector: 'CENTRO DE LA CIUDAD',
    ...overrides,
  };
}

function accepted(result: ParsedVoterRecord) {
  if (!result.ok)
    throw new Error(`expected the record to be accepted: ${result.reasons.join('; ')}`);
  return result;
}

function reasonsFor(overrides: Record<string, unknown>): string[] {
  const result = parseVoterRecord(rawRecord(overrides));
  if (result.ok) throw new Error('expected the record to be rejected');
  return result.reasons;
}

describe('parseVoterRecord: mapping', () => {
  it('maps a clean record to a voter', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord()));
    expect(voter).toEqual({
      _id: '00112345673',
      firstNames: 'JUAN CARLOS',
      lastName1: 'PEREZ',
      lastName2: 'RODRIGUEZ',
      fullName: 'JUAN CARLOS PEREZ RODRIGUEZ',
      searchName: 'juan carlos perez rodriguez',
      birthDate: '1985-07-14',
      birthMonth: 7,
      birthDay: 14,
      recintoKey: 'liceo-juan-pablo-duarte--centro-de-la-ciudad',
      recintoName: 'LICEO JUAN PABLO DUARTE',
      colegioId: 4675,
      sector: 'CENTRO DE LA CIUDAD',
      checkDigitValid: true,
    });
  });

  it('moves the constant province/municipality/circ fields to the source metadata', () => {
    const { voter, source } = accepted(parseVoterRecord(rawRecord()));
    expect(source).toEqual({
      idProvincia: 2,
      descripcionProvincia: 'LA ALTAGRACIA',
      idMunicipio: 28,
      descripcionMunicipio: 'HIGUEY',
      codigoCircunscripcion: '01',
    });
    for (const key of ['idProvincia', 'idMunicipio', 'codigoCircunscripcion', 'provincia']) {
      expect(voter).not.toHaveProperty(key);
    }
  });

  it('ignores unknown extra keys', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ extra: 'x' })));
    expect(voter).not.toHaveProperty('extra');
  });
});

describe('parseVoterRecord: anomalies of the real file', () => {
  it('accepts a null apellido2 (21.5 % of voters) without a trailing space in the names', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ apellido2: null })));
    expect(voter.lastName2).toBeNull();
    expect(voter.fullName).toBe('JUAN CARLOS PEREZ');
    expect(voter.searchName).toBe('juan carlos perez');
  });

  it('treats a blank apellido2 like null', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ apellido2: '  ' })));
    expect(voter.lastName2).toBeNull();
    expect(voter.fullName).toBe('JUAN CARLOS PEREZ');
  });

  it('keeps accents in display names and strips them from searchName', () => {
    const { voter } = accepted(
      parseVoterRecord(
        rawRecord({ nombres: 'JOSÉ ÁNGEL', apellido1: 'NÚÑEZ', apellido2: 'GÜICHARDO' }),
      ),
    );
    expect(voter.fullName).toBe('JOSÉ ÁNGEL NÚÑEZ GÜICHARDO');
    expect(voter.searchName).toBe('jose angel nunez guichardo');
  });

  it('keeps the stray ´ in display names and drops it from searchName', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ apellido1: 'D´OLEO' })));
    expect(voter.lastName1).toBe('D´OLEO');
    expect(voter.searchName).toBe('juan carlos doleo rodriguez');
  });

  it('accepts one to five given names', () => {
    const { voter } = accepted(
      parseVoterRecord(rawRecord({ nombres: 'MARIA DE LOS ANGELES ALTAGRACIA' })),
    );
    expect(voter.firstNames).toBe('MARIA DE LOS ANGELES ALTAGRACIA');
  });

  it('collapses stray spaces in names, recinto and sector', () => {
    const { voter } = accepted(
      parseVoterRecord(
        rawRecord({
          nombres: ' JUAN  CARLOS ',
          apellido1: 'PEREZ ',
          descripcionRecinto: 'LICEO  JUAN PABLO DUARTE ',
          descripcionSector: ' CENTRO DE LA CIUDAD',
        }),
      ),
    );
    expect(voter.firstNames).toBe('JUAN CARLOS');
    expect(voter.fullName).toBe('JUAN CARLOS PEREZ RODRIGUEZ');
    expect(voter.recintoName).toBe('LICEO JUAN PABLO DUARTE');
    expect(voter.sector).toBe('CENTRO DE LA CIUDAD');
    expect(voter.recintoKey).toBe('liceo-juan-pablo-duarte--centro-de-la-ciudad');
  });

  it('gives a recinto name repeated across sectors a distinct key per sector', () => {
    const keys = ['JUANILLO', 'LA OTRA BANDA', 'VERÓN'].map(
      (sector) =>
        accepted(
          parseVoterRecord(
            rawRecord({ descripcionRecinto: 'ESCUELA PRIMARIA RURAL', descripcionSector: sector }),
          ),
        ).voter.recintoKey,
    );
    expect(keys).toEqual([
      'escuela-primaria-rural--juanillo',
      'escuela-primaria-rural--la-otra-banda',
      'escuela-primaria-rural--veron',
    ]);
  });

  it('accepts a bad check digit and flags it (warning, never a rejection)', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ cedula: '00112345670' })));
    expect(voter._id).toBe('00112345670');
    expect(voter.checkDigitValid).toBe(false);
  });

  it('accepts voters over 100 years old', () => {
    const { voter } = accepted(parseVoterRecord(rawRecord({ fechaNacimiento: '1901-03-02' })));
    expect(voter.birthDate).toBe('1901-03-02');
    expect(voter.birthMonth).toBe(3);
    expect(voter.birthDay).toBe(2);
  });

  it('keeps the birth date as the exact string and splits month and day', () => {
    for (const [date, month, day] of [
      ['2000-01-01', 1, 1],
      ['1999-12-31', 12, 31],
      ['1960-02-29', 2, 29],
    ] as const) {
      const { voter } = accepted(parseVoterRecord(rawRecord({ fechaNacimiento: date })));
      expect(voter).toMatchObject({ birthDate: date, birthMonth: month, birthDay: day });
    }
  });
});

describe('parseVoterRecord: rejections', () => {
  it('rejects a record that is not an object', () => {
    for (const raw of [null, 'text', 42, []]) {
      const result = parseVoterRecord(raw);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a cédula that is not 11 digits', () => {
    expect(reasonsFor({ cedula: '001-1234567-3' })).toEqual([
      'cedula: La cédula debe tener 11 dígitos.',
    ]);
    expect(reasonsFor({ cedula: 112345673 })).toEqual(['cedula: La cédula debe tener 11 dígitos.']);
  });

  it('names a missing field', () => {
    const raw = rawRecord();
    delete raw.apellido1;
    const result = parseVoterRecord(raw);
    expect(result).toEqual({ ok: false, reasons: ['apellido1: falta el campo'] });
  });

  it('rejects blank required names', () => {
    expect(reasonsFor({ nombres: '   ' })).toEqual(['nombres: está vacío']);
  });

  it('rejects an apellido2 that is neither text nor null', () => {
    expect(reasonsFor({ apellido2: 7 })).toEqual(['apellido2: debe ser texto o null']);
  });

  it('rejects impossible or badly written birth dates', () => {
    for (const date of [
      '1985-02-29',
      '1985-13-01',
      '1985-00-10',
      '1985-04-31',
      '14/07/1985',
      '1985-7-14',
    ]) {
      expect(reasonsFor({ fechaNacimiento: date })).toEqual([
        'fechaNacimiento: debe ser una fecha AAAA-MM-DD válida',
      ]);
    }
  });

  it('rejects a voter from another municipio (Higüey only)', () => {
    expect(reasonsFor({ idMunicipio: 1 })).toEqual([
      `idMunicipio: debe ser ${HIGUEY_MUNICIPIO_ID} (Higüey)`,
    ]);
  });

  it('rejects a colegio id that is not a positive integer', () => {
    expect(reasonsFor({ idColegio: '4675' })).toEqual(['idColegio: debe ser un número entero']);
    expect(reasonsFor({ idColegio: 46.5 })).toEqual(['idColegio: debe ser un número entero']);
    expect(reasonsFor({ idColegio: 0 })).toEqual(['idColegio: debe ser positivo']);
  });

  it('rejects a recinto or sector without letters or digits', () => {
    expect(reasonsFor({ descripcionRecinto: ' ´ ' })).toEqual([
      'descripcionRecinto: no contiene letras ni números',
    ]);
    expect(reasonsFor({ descripcionSector: '' })).toEqual([
      'descripcionSector: no contiene letras ni números',
    ]);
  });

  it('lists every problem of a record', () => {
    expect(reasonsFor({ cedula: '1', nombres: '' })).toEqual([
      'cedula: La cédula debe tener 11 dígitos.',
      'nombres: está vacío',
    ]);
  });
});

describe('isCalendarDate', () => {
  it('knows leap years', () => {
    expect(isCalendarDate('2000-02-29')).toBe(true);
    expect(isCalendarDate('1904-02-29')).toBe(true);
    expect(isCalendarDate('1900-02-29')).toBe(false);
    expect(isCalendarDate('2001-02-29')).toBe(false);
  });

  it('knows month lengths', () => {
    expect(isCalendarDate('2001-01-31')).toBe(true);
    expect(isCalendarDate('2001-06-31')).toBe(false);
    expect(isCalendarDate('2001-12-32')).toBe(false);
  });
});

describe('recintoKeyOf', () => {
  it('joins the recinto and sector slugs with a double dash', () => {
    expect(recintoKeyOf('ESCUELA PRIMARIA RURAL', 'JUANILLO')).toBe(
      'escuela-primaria-rural--juanillo',
    );
  });
});
