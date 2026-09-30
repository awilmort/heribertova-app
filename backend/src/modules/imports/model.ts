import { VOTER_IMPORT_STATUSES, type VoterImportStatus } from '@heribertova/shared';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import type { VoterImportReport } from './report';

/**
 * Lifecycle of a voter import (`VOTER_IMPORT_STATUSES`, shared with the frontend's polling UI).
 * `uploaded` belongs to the browser upload of plan 9.1; the CLI starts at `validating`. `failed`
 * imports can be staged again with the same file.
 */
export { VOTER_IMPORT_STATUSES, type VoterImportStatus };

/** Rows processed so far while `status` is `uploaded` or `validating` (plan 9.1's progress bar). */
export interface VoterImportProgress {
  rowsProcessed: number;
}

/** One voter file import and its history entry (HERIBERTO_ARCHITECTURE.md §3.2 step 5, §5). */
export interface VoterImport {
  _id: Types.ObjectId;
  /** Padrón cut label, e.g. "mayo2024". */
  cut: string;
  fileName: string;
  /** Object key in the imports bucket (plan 9.1); null for a CLI import from a local file. */
  s3Key: string | null;
  /** SHA-256 of the file (hex). One import per file content: the same file is never imported twice. */
  sha256: string;
  status: VoterImportStatus;
  /** The superadmin who uploaded it (plan 9.1); null for a CLI import. */
  uploadedBy: Types.ObjectId | null;
  /** Set while `status` is `uploaded` or `validating`; null otherwise. */
  progress: VoterImportProgress | null;
  /** Set once validation finishes (status `staged` and later). */
  report: VoterImportReport | null;
  /** Why the import failed (status `failed`). */
  failureReason: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VoterImportDocument = HydratedDocument<VoterImport>;

const voterImportSchema = new Schema<VoterImport>(
  {
    cut: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, default: null },
    sha256: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    status: { type: String, enum: VOTER_IMPORT_STATUSES, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    progress: { type: Schema.Types.Mixed, default: null },
    // Written whole by the import service, never edited in place; its shape is VoterImportReport.
    report: { type: Schema.Types.Mixed, default: null },
    failureReason: { type: String, default: null },
    appliedAt: { type: Date, default: null },
  },
  { collection: 'voterImports', timestamps: true, versionKey: false },
);

voterImportSchema.index({ sha256: 1 }, { unique: true });

export const VoterImportModel = model<VoterImport>('VoterImport', voterImportSchema);
