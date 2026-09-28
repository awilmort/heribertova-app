import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { cedulaCheckDigit } from '@heribertova/shared';
import type { RawVoterRecord } from '../src/modules/voters/voterFile';

/**
 * Synthetic Higüey voter file in exactly the shape of the real export (HERIBERTO_ARCHITECTURE.md
 * §3.1), with its anomalies, so no real voter data is ever needed in development or tests
 * (locked decision 10). Used by `scripts/fake-voter-file.ts` and by the import tests.
 *
 * Output is deterministic for a given seed. At the real size (181,551 voters) it reproduces the
 * real file's shape: 110 recintos (104 distinct names: "ESCUELA PRIMARIA RURAL" in 7 sectors, two
 * names written with stray spaces), 369 colegios, 80 sectors, 87 bad check digits, 84 voters over
 * 100 and about 21.5 % null `apellido2`.
 */

export const REAL_FILE = {
  voters: 181_551,
  recintos: 110,
  colegios: 369,
  sectors: 80,
  badCheckDigits: 87,
  overHundred: 84,
} as const;

/** Share of voters whose `apellido2` is null in the real file. */
const NULL_APELLIDO2_RATE = 0.215;
const REPEATED_RECINTO_NAME = 'ESCUELA PRIMARIA RURAL';
/** Recintos (by index) named REPEATED_RECINTO_NAME; indices below 80 map to distinct sectors. */
const REPEATED_RECINTO_INDICES = new Set([3, 15, 27, 39, 51, 63, 75]);
/** Recintos (by index) whose name is also written with stray spaces on about half their voters. */
const STRAY_SPACE_RECINTO_INDICES = new Set([10, 20]);

const NAMED_SECTORS = [
  'CENTRO DE LA CIUDAD',
  'VERÓN',
  'BÁVARO',
  'PUNTA CANA',
  'LA OTRA BANDA',
  'LAS LAGUNAS',
  'JUANILLO',
  'SAN JOSÉ',
  'SAN MARTÍN',
  'EL NAZARENO',
  'SAVICA',
  'LOS COQUITOS',
  'VILLA CERRO',
  'MAMÁ TINGÓ',
  'EL TOCONAL',
  'CAÑA HONDA',
  'CRISTO REY',
  'LA MALENA',
];
const RECINTO_TYPES = ['ESCUELA BÁSICA', 'LICEO', 'COLEGIO', 'POLITÉCNICO', 'CENTRO EDUCATIVO'];
const RECINTO_PATRONS = [
  'JUAN PABLO DUARTE',
  'MATÍAS RAMÓN MELLA',
  'FRANCISCO DEL ROSARIO SÁNCHEZ',
  'SALOMÉ UREÑA',
  'GREGORIO LUPERÓN',
  'NUESTRA SEÑORA DE LA ALTAGRACIA',
  'MARÍA TRINIDAD SÁNCHEZ',
];
const GIVEN_NAMES = [
  'JOSÉ',
  'MARÍA',
  'JUAN',
  'ÁNGEL',
  'RAMÓN',
  'ANA',
  'LUIS',
  'CARMEN',
  'MARTÍN',
  'ROSA',
  'JESÚS',
  'INÉS',
  'PEDRO',
  'ALTAGRACIA',
  'RAFAEL',
  'YOLANDA',
  'MIGUEL',
  'LUZ',
  'FRANCISCO',
  'MERCEDES',
  'NOEMÍ',
  'JOAQUÍN',
  'SOFÍA',
  'ESTHER',
];
const SURNAMES = [
  'PÉREZ',
  'RODRÍGUEZ',
  'NÚÑEZ',
  'PEÑA',
  'D´OLEO',
  'MUÑOZ',
  'GÜICHARDO',
  'SANTANA',
  'CEDEÑO',
  'MARTÍNEZ',
  'GARCÍA',
  'RIJO',
  'MORLA',
  'PAYANO',
  'CASTILLO',
  'DE LA ROSA',
  'SÁNCHEZ',
  'ZORRILLA',
];
/** Weights for 1–5 given names. */
const GIVEN_NAME_COUNT_WEIGHTS = [35, 50, 10, 4, 1];
const CEDULA_PREFIXES = ['001', '028', '402', '023'];

type Random = () => number;

/** mulberry32: small, fast, deterministic PRNG. */
function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** True for exactly `count` indices in [0, total), spread evenly. */
function isSpreadIndex(index: number, count: number, total: number): boolean {
  return Math.floor(((index + 1) * count) / total) > Math.floor((index * count) / total);
}

function proportional(realCount: number, voters: number): number {
  return Math.round((voters * realCount) / REAL_FILE.voters);
}

interface Recinto {
  name: string;
  sector: string;
  straySpaces: boolean;
}

function buildRecintos(): Recinto[] {
  const sectors = Array.from(
    { length: REAL_FILE.sectors },
    (_, i) => NAMED_SECTORS[i] ?? `SECTOR ${String(i + 1).padStart(2, '0')}`,
  );
  return Array.from({ length: REAL_FILE.recintos }, (_, i) => ({
    name: REPEATED_RECINTO_INDICES.has(i)
      ? REPEATED_RECINTO_NAME
      : `${RECINTO_TYPES[i % RECINTO_TYPES.length]} ${RECINTO_PATRONS[i % RECINTO_PATRONS.length]} ${i + 1}`,
    // Every sector gets one recinto; the remaining 30 are spread over the sectors again.
    sector: sectors[i < REAL_FILE.sectors ? i : (i * 7) % REAL_FILE.sectors] as string,
    straySpaces: STRAY_SPACE_RECINTO_INDICES.has(i),
  }));
}

/** `idColegio` values (4675–17300 in the real file) and the recinto each colegio belongs to. */
function buildColegios(): { id: number; recintoIndex: number }[] {
  return Array.from({ length: REAL_FILE.colegios }, (_, i) => ({
    id: 4675 + i * 34,
    recintoIndex: i < REAL_FILE.recintos ? i : (i * 13) % REAL_FILE.recintos,
  }));
}

function withStraySpaces(name: string): string {
  return `${name.replace(' ', '  ')} `;
}

function birthDate(random: Random, overHundred: boolean): string {
  const year = overHundred ? between(random, 1901, 1922) : between(random, 1925, 2006);
  // Everyone is 18 or older at the May 2024 cut.
  const month = year === 2006 ? between(random, 1, 4) : between(random, 1, 12);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = between(random, 1, daysInMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function givenNames(random: Random): string {
  const total = GIVEN_NAME_COUNT_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  let count = 1;
  for (const [i, weight] of GIVEN_NAME_COUNT_WEIGHTS.entries()) {
    roll -= weight;
    if (roll < 0) {
      count = i + 1;
      break;
    }
  }
  return Array.from({ length: count }, () => pick(random, GIVEN_NAMES)).join(' ');
}

function cedula(random: Random, index: number, validCheckDigit: boolean): string {
  // 7919 is coprime with 10^7, so the 7-digit bodies are unique for up to 10 million voters.
  const body = String((index * 7919 + 12_345) % 10_000_000).padStart(7, '0');
  const firstTen = `${CEDULA_PREFIXES[index % CEDULA_PREFIXES.length]}${body}`;
  const check = cedulaCheckDigit(firstTen);
  return `${firstTen}${validCheckDigit ? check : (check + between(random, 1, 9)) % 10}`;
}

export interface FakeVoterFileOptions {
  voters: number;
  seed?: number;
}

/** Yields the records of a synthetic voter file, one at a time (constant memory). */
export function* generateFakeVoterRecords({
  voters,
  seed = 2024,
}: FakeVoterFileOptions): Generator<RawVoterRecord> {
  const random = createRandom(seed);
  const recintos = buildRecintos();
  const colegios = buildColegios();
  const badCheckDigits = proportional(REAL_FILE.badCheckDigits, voters);
  const overHundred = proportional(REAL_FILE.overHundred, voters);

  for (let i = 0; i < voters; i++) {
    // The first 369 voters open one colegio each, so every colegio (and recinto, and sector) is used.
    const colegio = colegios[i] ?? pick(random, colegios);
    const recinto = recintos[colegio.recintoIndex] as Recinto;

    yield {
      cedula: cedula(random, i, !isSpreadIndex(i, badCheckDigits, voters)),
      nombres: givenNames(random),
      apellido1: pick(random, SURNAMES),
      apellido2: random() < NULL_APELLIDO2_RATE ? null : pick(random, SURNAMES),
      fechaNacimiento: birthDate(random, isSpreadIndex(i, overHundred, voters)),
      idProvincia: 2,
      descripcionProvincia: 'LA ALTAGRACIA',
      idMunicipio: 28,
      descripcionMunicipio: 'HIGUEY',
      codigoCircunscripcion: '01',
      descripcionRecinto:
        recinto.straySpaces && i % 2 === 0 ? withStraySpaces(recinto.name) : recinto.name,
      idColegio: colegio.id,
      descripcionSector: recinto.sector,
    };
  }
}

/** Serializes records as the export does: one JSON array of flat objects. */
export function* voterFileChunks(records: Iterable<unknown>): Generator<string> {
  yield '[';
  let first = true;
  for (const record of records) {
    yield `${first ? '' : ','}\n  ${JSON.stringify(record)}`;
    first = false;
  }
  yield '\n]\n';
}

/** Writes a synthetic voter file to `path`, streaming (honours backpressure). */
export async function writeFakeVoterFile(
  path: string,
  options: FakeVoterFileOptions,
): Promise<void> {
  const out = createWriteStream(path, { encoding: 'utf8' });
  for (const chunk of voterFileChunks(generateFakeVoterRecords(options))) {
    if (!out.write(chunk)) await once(out, 'drain');
  }
  out.end();
  await finished(out);
}
