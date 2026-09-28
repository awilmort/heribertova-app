import { model, Schema, type Types } from 'mongoose';

/** A person's place in the campaign structure. `coordinator` covers both coordinator roles. */
export const PERSON_LEVELS = ['member', 'aspiring_leader', 'team_leader', 'coordinator'] as const;
export type PersonLevel = (typeof PERSON_LEVELS)[number];

/** Follow-up status set by coordinators when validating a member (plan 5.4); null until then. */
export const PERSON_STATUSES = [
  'confirmed',
  'excused',
  'not_contacted',
  'deceased',
  'resigned',
  'sick',
  'inactive',
] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const DOC_STATUSES = ['pending', 'partial', 'complete'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** The voter data copied at registration and refreshed by voter imports (who they are, where they vote). */
export interface VoterSnapshot {
  fullName: string;
  recintoKey: string;
  recintoName: string;
  colegioId: number;
  sector: string;
  /** "YYYY-MM-DD", never a Date (see `Voter.birthDate`). */
  birthDate: string;
}

export interface StoredPhoto {
  /** Object key in the media bucket. */
  key: string;
  uploadedAt: Date;
}

/**
 * A registered member (HERIBERTO_ARCHITECTURE.md §5). Every leader and coordinator is also one;
 * their login is a separate `users` document. Registration rules and the API arrive in plan 5.1;
 * this is the schema they build on.
 */
export interface Person {
  _id: Types.ObjectId;
  /** 11 digits; one person per cédula. */
  cedula: string;
  voterSnapshot: VoterSnapshot;
  nickname: string | null;
  phone: string;
  phoneWhatsapp: boolean;
  phone2: string | null;
  phone2Whatsapp: boolean | null;
  email: string | null;
  level: PersonLevel;
  /** The person whose team they belong to. */
  leaderId: Types.ObjectId | null;
  /** Sponsor chain root → parent, so "everyone under me" is one indexed query. */
  ancestors: Types.ObjectId[];
  /** The user who registered them. */
  registeredBy: Types.ObjectId;
  status: PersonStatus | null;
  photos: { cedula?: StoredPhoto; selfie?: StoredPhoto };
  docStatus: DocStatus;
  validatedBy: Types.ObjectId | null;
  validatedAt: Date | null;
  /** When the person agreed to be registered (Ley 172-13). */
  consentAt: Date;
  /** Soft delete. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const voterSnapshotSchema = new Schema<VoterSnapshot>(
  {
    fullName: { type: String, required: true },
    recintoKey: { type: String, required: true },
    recintoName: { type: String, required: true },
    colegioId: { type: Number, required: true },
    sector: { type: String, required: true },
    birthDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { _id: false },
);

const storedPhotoSchema = new Schema<StoredPhoto>(
  {
    key: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const personSchema = new Schema<Person>(
  {
    cedula: { type: String, required: true, match: /^\d{11}$/ },
    voterSnapshot: { type: voterSnapshotSchema, required: true },
    nickname: { type: String, default: null },
    phone: { type: String, required: true },
    phoneWhatsapp: { type: Boolean, required: true },
    phone2: { type: String, default: null },
    phone2Whatsapp: { type: Boolean, default: null },
    email: { type: String, default: null },
    level: { type: String, enum: PERSON_LEVELS, required: true },
    leaderId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    ancestors: { type: [{ type: Schema.Types.ObjectId, ref: 'Person' }], default: [] },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: [...PERSON_STATUSES, null], default: null },
    photos: { cedula: storedPhotoSchema, selfie: storedPhotoSchema },
    docStatus: { type: String, enum: DOC_STATUSES, required: true },
    validatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    validatedAt: { type: Date, default: null },
    consentAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'people', timestamps: true, versionKey: false },
);

personSchema.index({ cedula: 1 }, { unique: true });
personSchema.index({ leaderId: 1, deletedAt: 1 });
personSchema.index({ ancestors: 1 });
personSchema.index({ 'voterSnapshot.recintoKey': 1 });
personSchema.index({ 'voterSnapshot.sector': 1 });
personSchema.index({ level: 1 });

export const PersonModel = model<Person>('Person', personSchema);
