import { cedulaSchema, hasValidCheckDigit } from '@heribertova/shared';
import { z } from 'zod';
import { collapseSpaces, normalizeForSearch, slugify } from '../../lib/text';
import type { Voter } from './model';

/**
 * The voter file: a JSON array of flat records exactly as exported for the May 2024 padrón
 * (HERIBERTO_ARCHITECTURE.md §3.1). This module validates one record and maps it to a voter; it is
 * pure (no I/O, no Date), so the import pipeline and its tests share one definition of the format.
 */

/** Municipio of Higüey in the export. Only Higüey voters can ever be registered (locked decision 1). */
export const HIGUEY_MUNICIPIO_ID = 28;

type TypeIssue = { input?: unknown };
/** Spanish type errors that tell a missing key apart from a wrong value. */
function typeError(expected: string) {
  return (issue: TypeIssue) =>
    issue.input === undefined ? 'falta el campo' : `debe ser ${expected}`;
}

const text = z.string({ error: typeError('texto') });
const nonBlankText = text.refine((value) => collapseSpaces(value) !== '', 'está vacío');
/** Text that becomes part of `recintoKey`, so it must keep at least one letter or digit. */
const keyText = text.refine((value) => slugify(value) !== '', 'no contiene letras ni números');
const integer = z.number({ error: typeError('un número entero') }).int('debe ser un número entero');

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** True for a real calendar date written "YYYY-MM-DD". Plain arithmetic: no Date, so no time zone. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return day <= lastDay;
}

/** One raw record of the file. Unknown extra keys are ignored rather than rejected. */
export const rawVoterRecordSchema = z.object(
  {
    cedula: cedulaSchema,
    nombres: nonBlankText,
    apellido1: nonBlankText,
    apellido2: z.string({ error: typeError('texto o null') }).nullable(),
    fechaNacimiento: text.refine(isCalendarDate, 'debe ser una fecha AAAA-MM-DD válida'),
    idProvincia: integer,
    descripcionProvincia: text,
    idMunicipio: z.literal(HIGUEY_MUNICIPIO_ID, {
      error: `debe ser ${HIGUEY_MUNICIPIO_ID} (Higüey)`,
    }),
    descripcionMunicipio: text,
    codigoCircunscripcion: text,
    descripcionRecinto: keyText,
    idColegio: integer.positive('debe ser positivo'),
    descripcionSector: keyText,
  },
  { error: 'el registro no es un objeto' },
);
export type RawVoterRecord = z.infer<typeof rawVoterRecordSchema>;

/** A mapped voter as held in the staging collection: the `voters` fields the file determines, plus
 * the recinto's display name (which `voters` does not store; it goes to `recintos`). */
export type StagedVoter = Omit<Voter, 'status' | 'importId' | 'updatedAt'> & {
  recintoName: string;
};

/** The fields that are constant across the file. They are kept on the import record, not on voters. */
export type VoterFileSource = Pick<
  RawVoterRecord,
  | 'idProvincia'
  | 'descripcionProvincia'
  | 'idMunicipio'
  | 'descripcionMunicipio'
  | 'codigoCircunscripcion'
>;

export function recintoKeyOf(recintoName: string, sector: string): string {
  return `${slugify(recintoName)}--${slugify(sector)}`;
}

/** Maps a validated record to the voter it describes. */
export function toStagedVoter(record: RawVoterRecord): StagedVoter {
  const firstNames = collapseSpaces(record.nombres);
  const lastName1 = collapseSpaces(record.apellido1);
  const lastName2 = record.apellido2 === null ? null : collapseSpaces(record.apellido2) || null;
  const fullName = [firstNames, lastName1, lastName2].filter((part) => part !== null).join(' ');
  const recintoName = collapseSpaces(record.descripcionRecinto);
  const sector = collapseSpaces(record.descripcionSector);
  const [, month, day] = record.fechaNacimiento.split('-');

  return {
    _id: record.cedula,
    firstNames,
    lastName1,
    lastName2,
    fullName,
    searchName: normalizeForSearch(fullName),
    birthDate: record.fechaNacimiento,
    birthMonth: Number(month),
    birthDay: Number(day),
    recintoKey: recintoKeyOf(recintoName, sector),
    recintoName,
    colegioId: record.idColegio,
    sector,
    checkDigitValid: hasValidCheckDigit(record.cedula),
  };
}

export function toVoterFileSource(record: RawVoterRecord): VoterFileSource {
  return {
    idProvincia: record.idProvincia,
    descripcionProvincia: record.descripcionProvincia,
    idMunicipio: record.idMunicipio,
    descripcionMunicipio: record.descripcionMunicipio,
    codigoCircunscripcion: record.codigoCircunscripcion,
  };
}

export type ParsedVoterRecord =
  { ok: true; voter: StagedVoter; source: VoterFileSource } | { ok: false; reasons: string[] };

/** Validates and maps one raw record. Rejections carry one Spanish reason per problem ("apellido1: está vacío"). */
export function parseVoterRecord(raw: unknown): ParsedVoterRecord {
  const result = rawVoterRecordSchema.safeParse(raw);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
    return { ok: false, reasons };
  }
  return { ok: true, voter: toStagedVoter(result.data), source: toVoterFileSource(result.data) };
}
