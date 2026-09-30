import type { PromotionSettings } from '@heribertova/shared';
import { model, Schema } from 'mongoose';

/** A single document, `_id: 'promotion'` (HERIBERTO_ARCHITECTURE.md §5). One settings kind exists
 * today; a second would get its own fixed `_id`, not a new collection. */
export interface SettingsDocument extends PromotionSettings {
  _id: 'promotion';
}

const settingsSchema = new Schema<SettingsDocument>(
  {
    _id: { type: String, required: true },
    nominationMinInitialMembers: { type: Number, required: true, min: 1 },
    autoPromotionThreshold: { type: Number, required: true, min: 1 },
    teamGoal: { type: Number, required: true, min: 1 },
    maxOpenAspirantsPerNominator: { type: Number, required: true, min: 1 },
  },
  { collection: 'settings', versionKey: false },
);

export const SettingsModel = model<SettingsDocument>('Settings', settingsSchema);
