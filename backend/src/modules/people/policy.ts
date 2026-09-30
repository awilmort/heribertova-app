import { hasValidCheckDigit, type CheckPersonResponse } from '@heribertova/shared';
import type { ClientSession } from 'mongoose';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import { isInScope, type ScopeUser } from './scope';
import { PersonModel } from './model';

/**
 * RegistrationPolicy (HERIBERTO_ARCHITECTURE.md §6.1): whether `cedula` can become a `people`
 * record. A bad check digit never blocks registration (87 real voters fail it) — it is
 * informational only. There is no party-affiliation check by design. Pass `session` to reuse this
 * inside a caller's transaction (plan 6.1's nomination, which registers several people at once) so
 * every check sees that transaction's own uncommitted writes, not just what is already committed.
 */
export async function checkEligibility(
  cedula: string,
  actor: ScopeUser,
  session?: ClientSession,
): Promise<CheckPersonResponse> {
  const voter = await VoterModel.findOne({ _id: cedula, status: 'active' })
    .session(session ?? null)
    .lean();
  if (!voter) {
    return {
      eligible: false,
      code: 'not_a_voter',
      reason: 'Esta cédula no figura en el padrón de Higüey.',
    };
  }

  const existing = await PersonModel.findOne({ cedula, deletedAt: null })
    .select({ ancestors: 1, voterSnapshot: 1, leaderId: 1 })
    .session(session ?? null)
    .lean();
  if (existing) {
    const leader =
      existing.leaderId && isInScope(actor, existing)
        ? await PersonModel.findById(existing.leaderId)
            .select({ 'voterSnapshot.fullName': 1 })
            .session(session ?? null)
            .lean()
        : null;
    return {
      eligible: false,
      code: 'already_registered',
      reason: 'Ya está registrado(a).',
      leaderName: leader?.voterSnapshot.fullName ?? null,
    };
  }

  const recinto = await RecintoModel.findById(voter.recintoKey)
    .select({ name: 1 })
    .session(session ?? null)
    .lean();
  if (!recinto) throw new Error(`Voter ${voter._id} votes in unknown recinto ${voter.recintoKey}`);

  return {
    eligible: true,
    fullName: voter.fullName,
    recintoKey: voter.recintoKey,
    recintoName: recinto.name,
    colegioId: voter.colegioId,
    sector: voter.sector,
    checkDigitValid: hasValidCheckDigit(cedula),
  };
}
