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
  },
  { collection: 'sessions', versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<Session>('Session', sessionSchema);
