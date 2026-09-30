import { z } from 'zod';

/** A person's place in the campaign structure (HERIBERTO_ARCHITECTURE.md §5). `coordinator` covers both coordinator roles. */
export const PERSON_LEVELS = ['member', 'aspiring_leader', 'team_leader', 'coordinator'] as const;
export const personLevelSchema = z.enum(PERSON_LEVELS);
export type PersonLevel = z.infer<typeof personLevelSchema>;
