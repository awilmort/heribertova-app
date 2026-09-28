import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseVoterRecord } from './voterFile';

/**
 * The birth date is the default password (DDMMYYYY), so it must never shift a day. A midnight-UTC
 * Date rendered in Dominican time (UTC−4) lands on the previous day; this file runs the mapper with
 * the process in America/Santo_Domingo to prove it never goes through a Date.
 */
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Santo_Domingo';
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function record(fechaNacimiento: string) {
  return {
    cedula: '00112345673',
    nombres: 'ANA',
    apellido1: 'DIAZ',
    apellido2: null,
    fechaNacimiento,
    idProvincia: 2,
    descripcionProvincia: 'LA ALTAGRACIA',
    idMunicipio: 28,
    descripcionMunicipio: 'HIGUEY',
    codigoCircunscripcion: '01',
    descripcionRecinto: 'ESCUELA BASICA',
    idColegio: 5000,
    descripcionSector: 'CENTRO',
  };
}

describe('birth date under TZ=America/Santo_Domingo', () => {
  it('really runs in Dominican time (UTC−4), where a UTC-midnight Date shows the previous day', () => {
    expect(new Date(2000, 0, 1).getTimezoneOffset()).toBe(240);
    // The bug this guards against: parsing the string as a Date and reading local fields.
    const naive = new Date('2000-01-01');
    expect([naive.getFullYear(), naive.getMonth() + 1, naive.getDate()]).toEqual([1999, 12, 31]);
  });

  it.each([
    ['2000-01-01', 1, 1],
    ['1985-03-01', 3, 1],
    ['1960-02-29', 2, 29],
    ['1999-12-31', 12, 31],
    ['1901-01-01', 1, 1],
  ])('keeps %s with month %i and day %i', (date, month, day) => {
    const result = parseVoterRecord(record(date));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.voter.birthDate).toBe(date);
    expect(result.voter.birthMonth).toBe(month);
    expect(result.voter.birthDay).toBe(day);
  });
});
