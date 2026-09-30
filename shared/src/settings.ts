import { z } from 'zod';

/**
 * The promotion thresholds (HERIBERTO_ARCHITECTURE.md §5, `settings` doc `_id: 'promotion'`), a
 * stored setting rather than a constant because the campaign may want to tune them (plan 6.1). LOE
 * defaults: 2 initial members to nominate an aspirant, 8 members to auto-promote to team leader, a
 * team goal of 20, and one open aspirant per nominator at a time.
 */
export const promotionSettingsSchema = z.object({
  nominationMinInitialMembers: z.number().int().positive(),
  autoPromotionThreshold: z.number().int().positive(),
  teamGoal: z.number().int().positive(),
  maxOpenAspirantsPerNominator: z.number().int().positive(),
});
export type PromotionSettings = z.infer<typeof promotionSettingsSchema>;

export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  nominationMinInitialMembers: 2,
  autoPromotionThreshold: 8,
  teamGoal: 20,
  maxOpenAspirantsPerNominator: 1,
};

/** `GET/PUT /api/settings/promotion` (plan 6.1, superadmin only): both share this shape. */
export const updatePromotionSettingsRequestSchema = promotionSettingsSchema;
export type UpdatePromotionSettingsRequest = z.infer<typeof updatePromotionSettingsRequestSchema>;
