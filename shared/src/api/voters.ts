import { z } from 'zod';
import { PERSON_LEVELS } from '../personLevels';

/**
 * Whether the looked-up voter is already a registered member (plan 2.2):
 * - `none`: not registered yet;
 * - `out_of_scope`: registered, but outside the caller's scope, so no details are shown;
 * - `member`: registered and in the caller's scope, with their level and team leader.
 */
export const voterMembershipSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('out_of_scope') }),
  z.object({
    status: z.literal('member'),
    level: z.enum(PERSON_LEVELS),
    /** Full name of their team leader; null at the top of the structure. */
    leaderName: z.string().nullable(),
  }),
]);
export type VoterMembership = z.infer<typeof voterMembershipSchema>;

/** The padrón card of `GET /api/voters/:cedula`: the fields the voter file holds. */
export const voterCardSchema = z.object({
  cedula: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  birthDay: z.number().int().min(1).max(31),
  birthMonth: z.number().int().min(1).max(12),
  sector: z.string(),
  recintoKey: z.string(),
  recintoName: z.string(),
  colegioId: z.number().int(),
  membership: voterMembershipSchema,
});
export type VoterCard = z.infer<typeof voterCardSchema>;

/** `GET /api/sectors`: sector → recintos → colegios, with voter counts, for filters across the app. */
export const sectorsResponseSchema = z.object({
  sectors: z.array(
    z.object({
      name: z.string(),
      voterCount: z.number().int(),
      recintos: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          voterCount: z.number().int(),
          colegios: z.array(z.object({ id: z.number().int(), voterCount: z.number().int() })),
        }),
      ),
    }),
  ),
});
export type SectorsResponse = z.infer<typeof sectorsResponseSchema>;
