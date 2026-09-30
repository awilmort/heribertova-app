import { PassThrough, type Readable } from 'node:stream';
import {
  createImportRequestSchema,
  importUploadUrlRequestSchema,
  type CreateImportRequest,
  type CreateImportResponse,
  type ImportUploadUrlRequest,
  type ImportUploadUrlResponse,
  type VoterImportDto,
  type VoterImportListResponse,
} from '@heribertova/shared';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { requireRecentTotp } from '../../middleware/requireRecentTotp';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import type { ObjectStorage } from '../../storage/objectStorage';
import { actorOf, audit } from '../audit/service';
import { UserModel } from '../users/model';
import { VoterImportModel, type VoterImportDocument } from './model';
import {
  applyVoterImport,
  createUploadedImport,
  discardStaging,
  validateUploadedImport,
  type OpenVoterFile,
} from './service';

export interface ImportRoutesOptions {
  /** The imports bucket (S3_IMPORTS_BUCKET), behind the same small interface every bucket uses. */
  objectStorage: ObjectStorage;
}

/** How long the browser has to PUT the file once it has the presigned URL: generous for 150 MB. */
const UPLOAD_URL_TTL_SECONDS = 60 * 60;
/** The import history is a campaign's worth of padrón cuts (dozens, not thousands): no pagination. */
const MAX_HISTORY = 200;

function toDto(record: VoterImportDocument, uploadedByUsername: string | null): VoterImportDto {
  return {
    id: record.id,
    cut: record.cut,
    fileName: record.fileName,
    sha256: record.sha256,
    status: record.status,
    progress: record.progress,
    report: record.report,
    failureReason: record.failureReason,
    uploadedByUsername,
    appliedAt: record.appliedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** The cédula of `userId`'s account, or null (a CLI import, or the account no longer exists). */
async function usernameOf(userId: Types.ObjectId | null): Promise<string | null> {
  if (!userId) return null;
  const user = await UserModel.findById(userId).select({ username: 1 }).lean();
  return user?.username ?? null;
}

/** The batched form of `usernameOf`, for the history list instead of one record. */
async function usernamesById(userIds: readonly Types.ObjectId[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await UserModel.find({ _id: { $in: userIds } })
    .select({ username: 1 })
    .lean();
  return new Map(users.map((user) => [user._id.toHexString(), user.username]));
}

const idParamsSchema = z.object({ id: z.string() });

/** Adapts an async object-storage read into the synchronous factory `OpenVoterFile` needs: the
 * returned stream starts flowing once the S3 GetObject call resolves. */
function openFromStorage(storage: ObjectStorage, key: string): OpenVoterFile {
  return () => {
    const output = new PassThrough();
    storage
      .getStream(key)
      .then((source: Readable) => {
        source.on('error', (err) => output.destroy(err));
        source.pipe(output);
      })
      .catch((err: unknown) => output.destroy(err as Error));
    return output;
  };
}

/**
 * `/admin/padron` (superadmin only): a presigned upload straight to the imports bucket, then an
 * in-process, asynchronous validation the browser polls for progress and the final report (plan
 * 9.1); applying a staged import, discarding one, and the import history (plan 9.2).
 */
export function createImportRoutes({ objectStorage }: ImportRoutesOptions): ApiRoute[] {
  return [
    {
      method: 'post',
      path: '/imports/upload-url',
      access: 'voters.import',
      handlers: [
        requireRecentTotp,
        validate({ body: importUploadUrlRequestSchema }),
        async (req, res) => {
          const { fileName, sha256, cut } = req.body as ImportUploadUrlRequest;
          if (await VoterImportModel.exists({ sha256 })) {
            throw new AppError(409, 'DUPLICATE_IMPORT', 'Este archivo ya fue importado.');
          }
          const s3Key = `imports/${sha256}.json`;
          const uploadUrl = await objectStorage.presignPut(
            s3Key,
            'application/json',
            UPLOAD_URL_TTL_SECONDS,
          );
          req.log.info({ cut, fileName }, 'Voter import upload URL issued');
          res.json({ uploadUrl, s3Key } satisfies ImportUploadUrlResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/imports',
      access: 'voters.import',
      handlers: [
        requireRecentTotp,
        validate({ body: createImportRequestSchema }),
        async (req, res) => {
          const { s3Key, sha256, cut, fileName } = req.body as CreateImportRequest;
          const actor = actorOf(req);
          const result = await createUploadedImport({
            s3Key,
            sha256,
            cut,
            fileName,
            uploadedBy: actor.user._id,
          });

          if (result.kind === 'created') {
            await audit(
              actor,
              {
                action: 'import.uploaded',
                entity: 'import',
                entityId: result.record._id,
                summary: `Subió el archivo del padrón "${fileName}" (corte ${cut}).`,
              },
              null,
            );
            // Not awaited: the route answers immediately and the browser polls GET /imports/:id.
            void validateUploadedImport(result.record, openFromStorage(objectStorage, s3Key));
          }

          res.status(202).json({
            id: result.record.id,
            status: result.record.status,
          } satisfies CreateImportResponse);
        },
      ],
    },
    {
      method: 'get',
      path: '/imports/:id',
      access: 'voters.import',
      handlers: [
        validate({ params: idParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof idParamsSchema>;
          const record = await VoterImportModel.findById(id);
          if (!record) throw new AppError(404, 'NOT_FOUND', 'No se encontró la importación.');
          res.json(toDto(record, await usernameOf(record.uploadedBy)) satisfies VoterImportDto);
        },
      ],
    },
    {
      // `/admin/padron`'s history list (plan 9.2): every import ever staged, newest first.
      method: 'get',
      path: '/imports',
      access: 'voters.import',
      handlers: [
        async (_req, res) => {
          const records = await VoterImportModel.find().sort({ createdAt: -1 }).limit(MAX_HISTORY);
          const usernames = await usernamesById([
            ...new Set(records.flatMap((r) => (r.uploadedBy ? [r.uploadedBy] : []))),
          ]);
          res.json({
            items: records.map((record) =>
              toDto(
                record,
                record.uploadedBy ? (usernames.get(record.uploadedBy.toHexString()) ?? null) : null,
              ),
            ),
          } satisfies VoterImportListResponse);
        },
      ],
    },
    {
      // Applies a staged import (plan 9.2); idempotent — re-applying an already-`applied` one is a
      // no-op success (`applyVoterImport`'s own contract, plan 2.1).
      method: 'post',
      path: '/imports/:id/apply',
      access: 'voters.import',
      handlers: [
        requireRecentTotp,
        validate({ params: idParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof idParamsSchema>;
          const existing = await VoterImportModel.findById(id);
          if (!existing) throw new AppError(404, 'NOT_FOUND', 'No se encontró la importación.');

          let applied: VoterImportDocument;
          try {
            applied = await applyVoterImport(existing._id);
          } catch (err) {
            // applyVoterImport's own errors (wrong status, no accepted voters, a staging/report
            // mismatch) are for the CLI's console; the UI should never hit them since it only offers
            // "Aplicar" on a staged import, so a plain 409 with the message is enough here.
            throw new AppError(
              409,
              'VALIDATION_ERROR',
              err instanceof Error ? err.message : 'No se pudo aplicar la importación.',
            );
          }

          await audit(
            actorOf(req),
            {
              action: 'import.applied',
              entity: 'import',
              entityId: applied._id,
              summary: `Aplicó la importación del padrón "${applied.fileName}" (corte ${applied.cut}).`,
            },
            null,
          );
          res.json(toDto(applied, await usernameOf(applied.uploadedBy)) satisfies VoterImportDto);
        },
      ],
    },
    {
      // Discards a staged or failed import: drops its staging rows, deletes its S3 object and the
      // record itself (plan 9.2). Not `applying`/`applied` (irreversible) or `uploaded`/`validating`
      // (a background validation may still be writing to it).
      method: 'delete',
      path: '/imports/:id',
      access: 'voters.import',
      handlers: [
        requireRecentTotp,
        validate({ params: idParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof idParamsSchema>;
          const record = await VoterImportModel.findById(id);
          if (!record) throw new AppError(404, 'NOT_FOUND', 'No se encontró la importación.');
          if (record.status !== 'staged' && record.status !== 'failed') {
            throw new AppError(
              409,
              'VALIDATION_ERROR',
              'Solo se puede descartar una importación validada o fallida.',
            );
          }

          // Order matters for a safe retry: staging drop and S3 delete are both idempotent, so if
          // either throws, the record (and its status) survive untouched and the client can retry
          // the same DELETE. Only once both succeed is the record itself removed.
          await discardStaging(record._id);
          if (record.s3Key) await objectStorage.delete(record.s3Key);
          const { fileName, cut } = record;
          await record.deleteOne();

          await audit(
            actorOf(req),
            {
              action: 'import.discarded',
              entity: 'import',
              entityId: record._id,
              summary: `Descartó la importación del padrón "${fileName}" (corte ${cut}).`,
            },
            null,
          );
          res.status(204).end();
        },
      ],
    },
  ];
}
