import { model, Schema, type Types } from 'mongoose';

/**
 * A login halfway through: the superadmin's password was right and the TOTP code is still due
 * (plan 3.3). The browser holds a random token in the `__Host-totp` cookie; only its SHA-256 is
 * stored. It lives in its own collection, apart from `sessions`, so it can never be mistaken for a
 * session: the only thing it opens is `POST /api/auth/totp/verify`.
 */
export interface TotpChallenge {
  _id: Types.ObjectId;
  /** SHA-256 (hex) of the cookie token. */
  tokenHash: string;
  /** One open challenge per user: a new password step replaces the previous one. */
  userId: Types.ObjectId;
  /** Codes tried against this challenge (capped, and claimed atomically before each check). */
  attempts: number;
  /** MongoDB's TTL monitor deletes the document after it; lookups check it themselves. */
  expiresAt: Date;
}

const totpChallengeSchema = new Schema<TotpChallenge>(
  {
    tokenHash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attempts: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'totpChallenges', versionKey: false },
);

totpChallengeSchema.index({ tokenHash: 1 }, { unique: true });
totpChallengeSchema.index({ userId: 1 }, { unique: true });
totpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TotpChallengeModel = model<TotpChallenge>('TotpChallenge', totpChallengeSchema);
