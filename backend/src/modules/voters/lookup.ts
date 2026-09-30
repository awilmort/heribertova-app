import type { VoterCard } from '@heribertova/shared';
import { ageOn, campaignDate } from '../../lib/campaignDay';
import { AppError } from '../../lib/errors';
import type { Actor } from '../audit/service';
import { RecintoModel } from '../recintos/model';
import { lookupsToday, recordLookup } from './lookupQuota';
import { membershipOf } from './membership';
import { VoterModel } from './model';

export interface LookupOptions {
  /** Lookups allowed per user per campaign day. */
  dailyQuota: number;
  now?: Date;
}

/**
 * Consulta de Padrón (plan 2.2): the padrón card of an active Higüey voter.
 *
 * Not audited (too frequent and too routine to be worth an audit trail entry per lookup), but every
 * lookup — found or not — still counts toward the user's daily quota (429 beyond it), which is what
 * keeps the padrón from being scraped one cédula at a time. Two requests racing at the limit may both
 * pass: acceptable for a quota meant to stop bulk use, not to count exactly.
 *
 * Voters who are no longer in the current padrón (`inactive`) are not found: only active voters can
 * be registered. Membership details are shown only for people in the caller's scope.
 */
export async function lookupVoter(
  actor: Actor,
  cedula: string,
  { dailyQuota, now = new Date() }: LookupOptions,
): Promise<VoterCard> {
  if ((await lookupsToday(actor.user._id, now)) >= dailyQuota) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Alcanzó el límite de ${dailyQuota} consultas del padrón por día. Podrá consultar de nuevo mañana.`,
    );
  }

  const voter = await VoterModel.findOne({ _id: cedula, status: 'active' }).lean();
  await recordLookup(actor.user._id, now);
  if (!voter) {
    throw new AppError(404, 'NOT_FOUND', 'Esta cédula no figura en el padrón de Higüey.');
  }

  const recinto = await RecintoModel.findById(voter.recintoKey).select({ name: 1 }).lean();
  if (!recinto) throw new Error(`Voter ${voter._id} votes in unknown recinto ${voter.recintoKey}`);

  return {
    cedula: voter._id,
    fullName: voter.fullName,
    age: ageOn(voter.birthDate, campaignDate(now)),
    birthDay: voter.birthDay,
    birthMonth: voter.birthMonth,
    sector: voter.sector,
    recintoKey: voter.recintoKey,
    recintoName: recinto.name,
    colegioId: voter.colegioId,
    membership: await membershipOf(voter._id, actor.user),
  };
}
