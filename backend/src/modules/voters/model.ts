import { model, Schema, type Types } from 'mongoose';

export const VOTER_STATUSES = ['active', 'inactive'] as const;
export type VoterStatus = (typeof VOTER_STATUSES)[number];

/**
 * One voter of the Higüey padrón (HERIBERTO_ARCHITECTURE.md §5). Written only by the voter import
 * (modules/imports), read everywhere else. Voters missing from a newer file become `inactive` and
 * are never deleted, because members may reference them.
 */
export interface Voter {
  /** The cédula, 11 digits. */
  _id: string;
  firstNames: string;
  lastName1: string;
  lastName2: string | null;
  fullName: string;
  /** `normalizeForSearch(fullName)`: accent-free, lowercase, for prefix search. */
  searchName: string;
  /** "YYYY-MM-DD", never a Date: a midnight-UTC Date shown in UTC−4 moves to the previous day. */
  birthDate: string;
  birthMonth: number;
  birthDay: number;
  /** `recintos._id`: slug(recinto name) + "--" + slug(sector). */
  recintoKey: string;
  colegioId: number;
  sector: string;
  /** Informational only: 87 real cédulas fail the check digit. */
  checkDigitValid: boolean;
  status: VoterStatus;
  /** The import that last wrote this voter. */
  importId: Types.ObjectId;
  updatedAt: Date;
}

const voterSchema = new Schema<Voter>(
  {
    _id: { type: String, required: true },
    firstNames: { type: String, required: true },
    lastName1: { type: String, required: true },
    lastName2: { type: String, default: null },
    fullName: { type: String, required: true },
    searchName: { type: String, required: true },
    birthDate: { type: String, required: true },
    birthMonth: { type: Number, required: true },
    birthDay: { type: Number, required: true },
    recintoKey: { type: String, required: true },
    colegioId: { type: Number, required: true },
    sector: { type: String, required: true },
    checkDigitValid: { type: Boolean, required: true },
    status: { type: String, enum: VOTER_STATUSES, required: true },
    importId: { type: Schema.Types.ObjectId, ref: 'VoterImport', required: true },
  },
  { collection: 'voters', timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

voterSchema.index({ recintoKey: 1, colegioId: 1 });
voterSchema.index({ birthMonth: 1, birthDay: 1 });
voterSchema.index({ searchName: 1 });
voterSchema.index({ status: 1 });

export const VoterModel = model<Voter>('Voter', voterSchema);
