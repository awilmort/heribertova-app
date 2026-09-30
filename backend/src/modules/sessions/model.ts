import { model, Schema, type Types } from 'mongoose';

/**
 * A login session (HERIBERTO_ARCHITECTURE.md §7). The browser holds a random token in the
 * `__Host-sid` cookie; only its SHA-256 is stored, so a database leak yields no usable session.
 */
export interface Session {
  _id: Types.ObjectId;
  /** SHA-256 (hex) of the cookie token. */
  tokenHash: string;
  userId: Types.ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  /** The earlier of the idle and the absolute deadline. MongoDB's TTL monitor deletes the document after it. */
  expiresAt: Date;
  ip: string | null;
  /** User-Agent at login (truncated), to recognise the device. */
  ua: string | null;
  /** Set when this user's role changed since they logged in (plan 6.1's auto-promotion, or a manual
   * promote/demote): the UI refetches `/me` and shows the promotion celebration without a new login
   * (LOE parity), instead of the nav quietly lying about the user's permissions until they log out. */
  permissionsStale: boolean;
  /** When this session's user last passed `POST /api/auth/totp/reverify`; null before the first time.
   * `requireRecentTotp` (plan 9.1's voter-file upload) needs one within its own TTL of "now". */
  totpVerifiedAt: Date | null;
}

const sessionSchema = new Schema<Session>(
  {
    tokenHash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    ip: { type: String, default: null },
    ua: { type: String, default: null },
    permissionsStale: { type: Boolean, default: false },
    totpVerifiedAt: { type: Date, default: null },
  },
  { collection: 'sessions', versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
// Revoking every session of a user (password change or reset, deactivation, role change).
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<Session>('Session', sessionSchema);
