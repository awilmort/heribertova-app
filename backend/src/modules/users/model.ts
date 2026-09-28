import { ROLES, type Role } from '@heribertova/shared';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

/**
 * A login account (HERIBERTO_ARCHITECTURE.md §5, §7). Only aspirants and above have one; the person
 * behind it is `personId`. The username is the cédula.
 */
export interface User {
  _id: Types.ObjectId;
  personId: Types.ObjectId;
  /** The cédula, 11 digits. */
  username: string;
  /** argon2id (lib/password). */
  passwordHash: string;
  role: Role;
  /** recintoKeys a recinto_coordinator covers; empty for every other role. */
  recintoScopes: string[];
  /** True while the password is the default (birth date DDMMYYYY). */
  usingDefaultPassword: boolean;
  /** Deactivated users cannot log in, and their open sessions stop working on the next request. */
  isActive: boolean;
  /** Consecutive failed logins since the last success (drives the progressive lockout). */
  failedAttempts: number;
  /** Logins are refused until this moment. */
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  /**
   * The superadmin's TOTP secret, encrypted with TOTP_ENC_KEY (lib/secretBox); null for every
   * other role. Required for the superadmin, whose login always takes a second step.
   */
  totpSecretEnc: string | null;
  /** The last TOTP time step accepted, so a code is never accepted twice (replay). */
  totpLastUsedStep: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    username: { type: String, required: true, match: /^\d{11}$/ },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    recintoScopes: { type: [String], default: [] },
    usingDefaultPassword: { type: Boolean, required: true },
    isActive: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    totpSecretEnc: {
      type: String,
      default: null,
      required(this: User) {
        return this.role === 'superadmin';
      },
    },
    totpLastUsedStep: { type: Number, default: null },
  },
  { collection: 'users', timestamps: true, versionKey: false },
);

userSchema.index({ personId: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
// At most one superadmin, guaranteed by the database rather than by application checks.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'superadmin' }, name: 'one_superadmin' },
);

export const UserModel = model<User>('User', userSchema);
