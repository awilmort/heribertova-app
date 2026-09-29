/** A person's place in the campaign structure (HERIBERTO_ARCHITECTURE.md §5). `coordinator` covers both coordinator roles. */
export const PERSON_LEVELS = ['member', 'aspiring_leader', 'team_leader', 'coordinator'] as const;
export type PersonLevel = (typeof PERSON_LEVELS)[number];
