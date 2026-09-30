import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { formatCedula } from '@heribertova/shared';
import type { MongoConnectOptions } from '../../db/mongo';
import { maskCedulas } from '../../lib/mask';
import type { VoterImportReport } from './report';
import {
  applyVoterImport,
  dryRunVoterFile,
  failInterruptedValidations,
  stageVoterFile,
} from './service';

/**
 * `npm run voters:import --workspace=backend`: the command-line front end of the import core
 * (plan 2.1). `scripts/voters-import.ts` only wires it to the environment and the database.
 */

export const USAGE = `Usage: npm run voters:import --workspace=backend -- --file <path> [--cut <label>] [--dry-run | --apply]

  --file <path>   the voter file (JSON array, HERIBERTO_ARCHITECTURE.md §3.1)
  --dry-run       validate and print the report; writes nothing to the database
  --apply         stage the file (unless already staged) and apply it
  (neither)       stage the file and print the report; apply it later with --apply
  --cut <label>   padrón cut label, e.g. mayo2024 (required unless --dry-run)`;

export type ImportMode = 'dry-run' | 'stage' | 'apply';

/** `file` is absolute. Staging and applying need the padrón `cut` label; a dry run does not. */
export type ImportCliOptions =
  { mode: 'dry-run'; file: string } | { mode: 'stage' | 'apply'; file: string; cut: string };

/** Bad command-line arguments: print the message and USAGE, exit 2. */
export class UsageError extends Error {
  override name = 'UsageError';
}

/**
 * Parses the arguments after the script name. A relative `--file` is resolved against `cwd`
 * (the script passes npm's INIT_CWD, the directory the command was typed in).
 */
export function parseImportArgs(argv: readonly string[], cwd: string): ImportCliOptions {
  // `npm run voters:import -- --file x` forwards the separator; it carries no meaning here.
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        file: { type: 'string' },
        cut: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        apply: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }

  if (!values.file) throw new UsageError('--file is required');
  if (values['dry-run'] && values.apply)
    throw new UsageError('--dry-run and --apply exclude each other');
  const file = resolve(cwd, values.file);
  if (values['dry-run']) return { mode: 'dry-run', file };

  const cut = values.cut?.trim();
  if (!cut) throw new UsageError('--cut is required to stage or apply');
  return { mode: values.apply ? 'apply' : 'stage', file, cut };
}

/** A dry run must not write, not even the collections and indexes Mongoose creates on connect. */
export function connectOptionsFor(mode: ImportMode): MongoConnectOptions {
  return mode === 'dry-run' ? { autoCreate: false, autoIndex: false } : {};
}

/** SHA-256 (hex) of a file, streamed. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

const number = (value: number) => value.toLocaleString('en-US');
const cedula = (value: string | null) =>
  value === null ? '(no cédula)' : maskCedulas(formatCedula(value));

/** How many rejected rows the CLI prints (the report keeps more). */
export const PRINTED_REJECTED_ROWS = 20;

/** The report as terminal lines. Cédulas are masked: the output may end up in a shell history or log. */
export function formatReport(report: VoterImportReport): string[] {
  const { diff, totals } = report;
  const lines = [
    `Rows                  ${number(report.rows)}`,
    `Accepted              ${number(report.accepted)}`,
    `Rejected              ${number(report.rejected.count)}`,
    `Check-digit warnings  ${number(report.warnings.checkDigit.count)}`,
    `Recintos              ${number(totals.recintos)}`,
    `Colegios              ${number(totals.colegios)}`,
    `Sectors               ${number(totals.sectors)}`,
    ...report.source.map(
      (s) =>
        `Source                provincia ${s.idProvincia} ${s.descripcionProvincia} · municipio ${s.idMunicipio} ${s.descripcionMunicipio} · circunscripción ${s.codigoCircunscripcion}`,
    ),
    'Diff against the current padrón:',
    `  new voters          ${number(diff.newVoters.count)}`,
    `  moved recinto       ${number(diff.movedRecinto.count)}`,
    `  moved colegio       ${number(diff.movedColegio.count)}`,
    `  missing (inactive)  ${number(diff.missing.count)}`,
    `  recintos added      ${number(diff.recintosAdded.length)}`,
    `  recintos removed    ${number(diff.recintosRemoved.length)}${diff.recintosRemoved.length > 0 ? ` (${diff.recintosRemoved.join(', ')})` : ''}`,
  ];
  if (report.rejected.count > 0) {
    const shown = report.rejected.samples.slice(0, PRINTED_REJECTED_ROWS);
    lines.push(`Rejected rows (first ${shown.length} of ${number(report.rejected.count)}):`);
    for (const { row, cedula: value, reasons } of shown) {
      lines.push(`  row ${row}  ${cedula(value)}  ${reasons.join('; ')}`);
    }
  }
  return lines;
}

/** Runs one import command against the connected database, writing progress lines to `print`. */
export async function runVoterImport(
  options: ImportCliOptions,
  print: (line: string) => void,
): Promise<void> {
  const fileName = basename(options.file);
  const openFile = () => createReadStream(options.file);
  const sha256 = await sha256File(options.file);
  print(`Voter file ${fileName}`);
  print(`SHA-256    ${sha256}`);

  if (options.mode === 'dry-run') {
    formatReport(await dryRunVoterFile(openFile)).forEach((line) => print(line));
    print('Dry run: nothing was written to the database.');
    return;
  }

  for (const interrupted of await failInterruptedValidations()) {
    print(
      `Marked import ${interrupted.id} (${interrupted.fileName}) failed: its validation was interrupted.`,
    );
  }
  const record = await stageVoterFile({ openFile, sha256, fileName, cut: options.cut });
  if (record.status === 'applied') {
    print(
      `Already applied as import ${record.id} (${record.appliedAt?.toISOString()}): nothing to do.`,
    );
    return;
  }
  if (record.report) formatReport(record.report).forEach((line) => print(line));
  if (options.mode === 'stage') {
    print(
      record.status === 'staged'
        ? `Staged as import ${record.id}. Run again with --apply to apply it.`
        : `Import ${record.id} was interrupted while applying. Run again with --apply to finish it.`,
    );
    return;
  }

  await applyVoterImport(record._id);
  print(
    `Applied import ${record.id}: voters upserted, missing voters marked inactive, recintos rebuilt.`,
  );
}
