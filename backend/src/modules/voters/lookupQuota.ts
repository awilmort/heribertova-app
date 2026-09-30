import { model, Schema, type Types } from 'mongoose';
import { campaignDate } from '../../lib/campaignDay';

/**
 * How many padrón lookups a user has made today (plan 2.2's anti-scraping quota). Lookups are not
 * audited, so this is its own tiny counter collection rather than a count over `auditLogs`: one
 * document per user per campaign day, upserted with `$inc`. Old days are useless once the day has
 * passed, so a TTL index drops them after a short buffer.
 */
export interface VoterLookupQuota {
  /** `${userId}:${campaignDate}`, e.g. "65f.../2026-09-30" — unique by construction. */
  _id: string;
  count: number;
  createdAt: Date;
}

const voterLookupQuotaSchema = new Schema<VoterLookupQuota>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  {
    collection: 'voterLookupQuotas',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);
// Only "today"'s count is ever read; a few days' buffer is just headroom against clock skew.
voterLookupQuotaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export const VoterLookupQuotaModel = model<VoterLookupQuota>(
  'VoterLookupQuota',
  voterLookupQuotaSchema,
);

function keyFor(userId: Types.ObjectId, now: Date): string {
  return `${userId.toHexString()}:${campaignDate(now)}`;
}

/** Lookups `userId` has made today, before this one. */
export async function lookupsToday(userId: Types.ObjectId, now: Date): Promise<number> {
  const doc = await VoterLookupQuotaModel.findById(keyFor(userId, now)).lean();
  return doc?.count ?? 0;
}

/** Records that a lookup happened (called once the quota check has passed, whether or not the
 * voter was found — probing unknown cédulas still counts). */
export async function recordLookup(userId: Types.ObjectId, now: Date): Promise<void> {
  await VoterLookupQuotaModel.updateOne(
    { _id: keyFor(userId, now) },
    { $inc: { count: 1 } },
    { upsert: true },
  );
}
