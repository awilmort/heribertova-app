import { DEFAULT_PROMOTION_SETTINGS, type PromotionSettings } from '@heribertova/shared';
import mongoose, { type ClientSession } from 'mongoose';
import { audit, type Actor } from '../audit/service';
import { SettingsModel } from './model';

/**
 * The promotion thresholds (plan 6.1), seeded with the LOE defaults on first read rather than at
 * boot, so a fresh database (or a test) never needs a separate seed step. `upsert` makes the seed
 * safe under concurrent first reads.
 */
export async function getPromotionSettings(session?: ClientSession): Promise<PromotionSettings> {
  const doc = await SettingsModel.findOneAndUpdate(
    { _id: 'promotion' },
    { $setOnInsert: DEFAULT_PROMOTION_SETTINGS },
    { upsert: true, returnDocument: 'after', session },
  ).lean();
  return {
    nominationMinInitialMembers: doc.nominationMinInitialMembers,
    autoPromotionThreshold: doc.autoPromotionThreshold,
    teamGoal: doc.teamGoal,
    maxOpenAspirantsPerNominator: doc.maxOpenAspirantsPerNominator,
  };
}

/** `PUT /api/settings/promotion` (plan 6.1, superadmin only). */
export async function updatePromotionSettings(
  actor: Actor,
  next: PromotionSettings,
): Promise<PromotionSettings> {
  return mongoose.connection.transaction(async (session) => {
    await SettingsModel.updateOne({ _id: 'promotion' }, { $set: next }, { upsert: true, session });
    await audit(
      actor,
      {
        action: 'settings.updated',
        entity: 'settings',
        entityId: null,
        summary: 'Actualizó la configuración de promoción.',
      },
      session,
    );
    return next;
  });
}
