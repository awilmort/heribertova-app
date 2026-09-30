import type { Readable } from 'node:stream';
import mongoose, { type mongo, type Types } from 'mongoose';
import { readJsonArray } from '../../lib/jsonArray';
import { PersonModel } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import { parseVoterRecord, type StagedVoter, type VoterFileSource } from '../voters/voterFile';
import { VoterImportModel, type VoterImportDocument } from './model';
import {
  countWithSamples,
  VoterImportReportBuilder,
  type CurrentPlacement,
  type VoterImportReport,
} from './report';

/**
 * The voter import core (HERIBERTO_ARCHITECTURE.md §3.2), shared by the CLI (plan 2.1) and the
 * superadmin upload screen (plan 9.1):
 *
 * - `dryRunVoterFile`: validate a file and compute its report, writing nothing;
 * - `stageVoterFile`: the same, keeping the accepted voters in `voters_staging_{importId}`;
 * - `applyVoterImport`: move a staged import into `voters` and `recintos`.
 *
 * Files are streamed (constant memory) and one file content (SHA-256) is imported at most once.
 */

/** Accepted voters are looked up and staged in batches of this size. */
export const STAGING_BATCH_SIZE = 1_000;

/** Opens the file's bytes. A factory, so nothing is opened when the file turns out to be known. */
export type OpenVoterFile = () => Readable;

function database(): mongo.Db {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  return db;
}

export function stagingCollectionName(importId: Types.ObjectId): string {
  return `voters_staging_${importId.toHexString()}`;
}

function stagingCollection(importId: Types.ObjectId): mongo.Collection<StagedVoter> {
  return database().collection<StagedVoter>(stagingCollectionName(importId));
}

/** Drops the staging collection; a no-op when it does not exist. */
async function dropStaging(importId: Types.ObjectId): Promise<void> {
  await stagingCollection(importId).drop();
}

/** `DELETE /api/imports/:id` (plan 9.2's discard): drops `importId`'s staging collection, if any.
 * Safe to call again on retry — dropping a collection that is already gone is a no-op. */
export async function discardStaging(importId: Types.ObjectId): Promise<void> {
  await dropStaging(importId);
}

function cedulaOf(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('cedula' in raw)) return null;
  return typeof raw.cedula === 'string' ? raw.cedula : null;
}

interface AcceptedRecord {
  voter: StagedVoter;
  source: VoterFileSource;
}

/**
 * Streams the file, validates and maps every record, and builds the report. Accepted voters are
 * handed to `onBatch` (staging) in batches; `onProgress` is called with the running row count every
 * `STAGING_BATCH_SIZE` rows (plan 9.1's progress bar), whatever the accept/reject mix. Reads the
 * database for the diff; never writes to it.
 */
async function analyze(
  source: Readable,
  onBatch?: (voters: StagedVoter[]) => Promise<void>,
  onProgress?: (rowsProcessed: number) => Promise<void>,
): Promise<VoterImportReport> {
  const builder = new VoterImportReportBuilder();
  const cedulasInFile = new Set<string>();
  let batch: AcceptedRecord[] = [];
  let rowsProcessed = 0;

  const flush = async () => {
    const ids = batch.map(({ voter }) => voter._id);
    const current = await VoterModel.find({ _id: { $in: ids }, status: 'active' })
      .select({ recintoKey: 1, colegioId: 1 })
      .lean<(CurrentPlacement & { _id: string })[]>();
    const currentById = new Map(current.map((voter) => [voter._id, voter]));
    for (const { voter, source } of batch) {
      builder.accept(voter, source, currentById.get(voter._id));
    }
    await onBatch?.(batch.map(({ voter }) => voter));
    batch = [];
  };

  for await (const { index, value } of readJsonArray(source)) {
    const row = index + 1;
    rowsProcessed = row;
    const parsed = parseVoterRecord(value);
    if (!parsed.ok) {
      builder.reject({ row, cedula: cedulaOf(value), reasons: parsed.reasons });
    } else if (cedulasInFile.has(parsed.voter._id)) {
      builder.reject({
        row,
        cedula: parsed.voter._id,
        reasons: ['cedula: repetida en el archivo'],
      });
    } else {
      cedulasInFile.add(parsed.voter._id);
      batch.push({ voter: parsed.voter, source: parsed.source });
    }
    if (batch.length === STAGING_BATCH_SIZE) await flush();
    if (row % STAGING_BATCH_SIZE === 0) await onProgress?.(row);
  }
  if (batch.length > 0) await flush();
  if (rowsProcessed > 0) await onProgress?.(rowsProcessed);

  const missing = await countWithSamples(activeVotersNotIn(cedulasInFile));
  const currentRecintos = await RecintoModel.find().select({ _id: 1 }).lean<{ _id: string }[]>();
  return builder.build(
    missing,
    currentRecintos.map((recinto) => recinto._id),
  );
}

/**
 * Streams the cédulas of active voters that are not in `cedulas`. The explicit batch size keeps
 * memory flat: by default the server returns up to 16 MB per batch, i.e. every _id at once.
 */
async function* activeVotersNotIn(cedulas: ReadonlySet<string>): AsyncGenerator<string> {
  const active = VoterModel.find({ status: 'active' })
    .select({ _id: 1 })
    .lean<{ _id: string }[]>()
    .batchSize(STAGING_BATCH_SIZE)
    .cursor();
  for await (const { _id } of active) {
    if (!cedulas.has(_id)) yield _id;
  }
}

/** Validates a voter file and reports what applying it would change. Writes nothing to the database. */
export async function dryRunVoterFile(openFile: OpenVoterFile): Promise<VoterImportReport> {
  return analyze(openFile());
}

export interface StageVoterFileInput {
  openFile: OpenVoterFile;
  fileName: string;
  /** SHA-256 of the file content, hex. */
  sha256: string;
  cut: string;
  s3Key?: string | null;
  uploadedBy?: Types.ObjectId | null;
}

/**
 * Validates the file into a staging collection and saves the report on a `voterImports` record.
 *
 * The SHA-256 makes it idempotent: a file whose import is already staged, applying or applied is
 * not read again and its existing record is returned (check `status`). A failed import of the same
 * file is staged again from scratch. On failure the staging collection is dropped, the record is
 * marked `failed` and the error is rethrown.
 */
export async function stageVoterFile(input: StageVoterFileInput): Promise<VoterImportDocument> {
  await VoterImportModel.init();
  const existing = await VoterImportModel.findOne({ sha256: input.sha256 });
  if (existing && existing.status !== 'failed') {
    if (existing.status === 'uploaded' || existing.status === 'validating') {
      throw new Error(`Voter import ${existing.id} of this file is still being validated`);
    }
    return existing;
  }

  const record = existing ?? new VoterImportModel({ sha256: input.sha256 });
  record.set({
    cut: input.cut,
    fileName: input.fileName,
    s3Key: input.s3Key ?? null,
    uploadedBy: input.uploadedBy ?? null,
    status: 'validating',
    progress: { rowsProcessed: 0 },
    report: null,
    failureReason: null,
  });
  await record.save();
  return runValidation(record, input.openFile);
}

/**
 * Runs `analyze` against `openFile()` into `record`'s own staging collection, saving the report
 * (`staged`) or the failure (`failed`) on it. Shared by `stageVoterFile` (2.1, synchronous) and
 * `validateUploadedImport` (9.1, run in the background after the record is already `uploaded`).
 */
async function runValidation(
  record: VoterImportDocument,
  openFile: OpenVoterFile,
): Promise<VoterImportDocument> {
  const staging = stagingCollection(record._id);
  try {
    // A failed earlier attempt may have left rows behind.
    await dropStaging(record._id);
    const report = await analyze(
      openFile(),
      async (voters) => {
        await staging.insertMany(voters, { ordered: true });
      },
      async (rowsProcessed) => {
        await VoterImportModel.updateOne({ _id: record._id }, { progress: { rowsProcessed } });
      },
    );
    record.set({ status: 'staged', report, progress: null });
    await record.save();
    return record;
  } catch (err) {
    await dropStaging(record._id);
    record.set({
      status: 'failed',
      failureReason: err instanceof Error ? err.message : String(err),
      progress: null,
    });
    await record.save();
    throw err;
  }
}

export interface CreateUploadedImportInput {
  fileName: string;
  /** SHA-256 of the file content, hex. */
  sha256: string;
  cut: string;
  /** Where the browser already PUT the file (plan 9.1). */
  s3Key: string;
  uploadedBy: Types.ObjectId;
}

export type CreateUploadedImportResult =
  | { kind: 'created'; record: VoterImportDocument }
  | { kind: 'duplicate'; record: VoterImportDocument };

/**
 * `POST /api/imports` (plan 9.1): creates the `uploaded` record for a file the browser already PUT
 * to the imports bucket, without validating it yet — the route starts `validateUploadedImport` in the
 * background and answers immediately, so the browser has an id to poll. Idempotent on `sha256` like
 * `stageVoterFile`: a non-failed import of the same content is reported as a duplicate instead of
 * being recreated.
 */
export async function createUploadedImport(
  input: CreateUploadedImportInput,
): Promise<CreateUploadedImportResult> {
  await VoterImportModel.init();
  const existing = await VoterImportModel.findOne({ sha256: input.sha256 });
  if (existing && existing.status !== 'failed') return { kind: 'duplicate', record: existing };

  const record = existing ?? new VoterImportModel({ sha256: input.sha256 });
  record.set({
    cut: input.cut,
    fileName: input.fileName,
    s3Key: input.s3Key,
    uploadedBy: input.uploadedBy,
    status: 'uploaded',
    progress: null,
    report: null,
    failureReason: null,
  });
  await record.save();
  return { kind: 'created', record };
}

/**
 * Validates an import `createUploadedImport` just created, streaming its file from `openFile` (the
 * route passes the imports bucket's `getStream`). Meant to be started without awaiting it (the route
 * has already answered): never throws, since there is no caller left to catch it — every failure,
 * including one from `record.save()` itself, is recorded as `status: 'failed'` on the record.
 */
export async function validateUploadedImport(
  record: VoterImportDocument,
  openFile: OpenVoterFile,
): Promise<void> {
  try {
    record.set({ status: 'validating', progress: { rowsProcessed: 0 } });
    await record.save();
    await runValidation(record, openFile);
  } catch (err) {
    // runValidation already recorded `failed` for anything it caught; this is only for a failure
    // (e.g. the record.save() above) that happened before or outside of it.
    if (record.status !== 'failed') {
      record.set({
        status: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
        progress: null,
      });
      await record.save().catch(() => undefined);
    }
  }
}

/**
 * Marks imports left `validating` by a process that died mid-file (Ctrl-C, out of memory, restart)
 * as failed and drops their staging rows, so the same file can be staged again. Call it only when
 * no validation can be running in another process: the CLI does at start (it is the only importer
 * until plan 9.1, whose API should call it at boot).
 */
export async function failInterruptedValidations(): Promise<VoterImportDocument[]> {
  const interrupted = await VoterImportModel.find({ status: 'validating' });
  for (const record of interrupted) {
    await dropStaging(record._id);
    record.set({
      status: 'failed',
      failureReason: 'Validation was interrupted before it finished',
    });
    await record.save();
  }
  return interrupted;
}

/**
 * Applies a staged import. Every step is idempotent, so an import interrupted while `applying` is
 * finished by calling this again; an `applied` import is a no-op (it only makes sure its staging
 * collection is gone).
 *
 * 1. upsert the staged voters into `voters` as active, stamped with this import;
 * 2. mark every other active voter (absent from the file) inactive; voters are never deleted;
 * 3. rebuild `recintos` from the staged voters;
 * 4. mark the import applied, then drop the staging collection.
 */
export async function applyVoterImport(importId: Types.ObjectId): Promise<VoterImportDocument> {
  const record = await VoterImportModel.findById(importId);
  if (!record) throw new Error(`Voter import ${importId.toHexString()} not found`);
  if (record.status === 'applied') {
    await dropStaging(record._id);
    return record;
  }
  if ((record.status !== 'staged' && record.status !== 'applying') || !record.report) {
    throw new Error(
      `Voter import ${record.id} is ${record.status}; only a staged import can be applied`,
    );
  }
  if (record.report.accepted === 0) {
    throw new Error(
      `Voter import ${record.id} has no accepted voters; applying it would empty the padrón`,
    );
  }
  const staging = stagingCollection(record._id);
  const staged = await staging.countDocuments();
  if (staged !== record.report.accepted) {
    throw new Error(
      `Voter import ${record.id} has ${staged} staged voters but its report accepted ${record.report.accepted}`,
    );
  }

  // Collections and indexes must exist before the server-side $merge/$out write into them.
  await Promise.all([VoterModel.init(), RecintoModel.init()]);
  record.set({ status: 'applying' });
  await record.save();

  await mergeIntoVoters(staging, record._id);
  await deactivateMissingVoters(record._id);
  await rebuildRecintos(staging);
  await refreshMemberSnapshots();

  record.set({ status: 'applied', appliedAt: new Date() });
  await record.save();
  await dropStaging(record._id);
  return record;
}

async function mergeIntoVoters(
  staging: mongo.Collection<StagedVoter>,
  importId: Types.ObjectId,
): Promise<void> {
  await staging
    .aggregate([
      { $unset: 'recintoName' },
      { $set: { status: 'active', importId, updatedAt: '$$NOW' } },
      {
        $merge: {
          into: VoterModel.collection.collectionName,
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'insert',
        },
      },
    ])
    .toArray();
}

async function deactivateMissingVoters(importId: Types.ObjectId): Promise<void> {
  await VoterModel.updateMany(
    { status: 'active', importId: { $ne: importId } },
    { $set: { status: 'inactive' } },
  );
}

/** Replaces `recintos` atomically ($out keeps the collection's indexes). */
async function rebuildRecintos(staging: mongo.Collection<StagedVoter>): Promise<void> {
  await staging
    .aggregate([
      {
        $group: {
          _id: '$recintoKey',
          name: { $first: '$recintoName' },
          sector: { $first: '$sector' },
          colegios: { $addToSet: '$colegioId' },
          voterCount: { $sum: 1 },
        },
      },
      { $set: { colegios: { $sortArray: { input: '$colegios', sortBy: 1 } } } },
      { $out: RecintoModel.collection.collectionName },
    ])
    .toArray();
}

/**
 * Refreshes every registered member's `voterSnapshot` from their (now current) voter and recinto
 * records (plan 9.2's "members of moved voters show the new recinto"; `Person.voterSnapshot`'s own
 * doc comment has always called this "refreshed by voter imports"). A read-only aggregation ending
 * in `$merge` (MongoDB's update pipelines don't allow `$lookup`, unlike a plain aggregation), not a
 * per-person read-modify-write: `people` only grows to the campaign's member count, but this runs
 * after every apply, including the 181k-voter kind, so no round trip per member.
 *
 * The pipeline outputs only `_id` and `voterSnapshot`, so `$merge`'s `whenMatched: 'merge'` touches
 * that one field and leaves every other field on the document exactly as it was — it can never
 * clobber a concurrent edit to, say, a member's phone number.
 *
 * A person whose voter is missing from the new cut (now `inactive`) is left with their last-known
 * snapshot — there is no fresher data to bring in for them, and `people/service.ts`'s
 * `voterInactive` flag is what tells the UI "ya no figura en el padrón".
 */
async function refreshMemberSnapshots(): Promise<void> {
  await PersonModel.aggregate([
    { $match: { deletedAt: null } },
    {
      $lookup: {
        from: VoterModel.collection.collectionName,
        localField: 'cedula',
        foreignField: '_id',
        as: '_voter',
      },
    },
    { $unwind: '$_voter' },
    { $match: { '_voter.status': 'active' } },
    {
      $lookup: {
        from: RecintoModel.collection.collectionName,
        localField: '_voter.recintoKey',
        foreignField: '_id',
        as: '_recinto',
      },
    },
    { $unwind: { path: '$_recinto', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        voterSnapshot: {
          fullName: '$_voter.fullName',
          recintoKey: '$_voter.recintoKey',
          recintoName: { $ifNull: ['$_recinto.name', '$voterSnapshot.recintoName'] },
          colegioId: '$_voter.colegioId',
          sector: '$_voter.sector',
          birthDate: '$_voter.birthDate',
        },
      },
    },
    {
      $merge: {
        into: PersonModel.collection.collectionName,
        on: '_id',
        whenMatched: 'merge',
        whenNotMatched: 'discard',
      },
    },
  ]);
}
