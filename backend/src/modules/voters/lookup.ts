import { formatCedula, type VoterCard, type VoterMembership } from '@heribertova/shared';
import { ageOn, campaignDate, startOfCampaignDay } from '../../lib/campaignDay';
import { AppError } from '../../lib/errors';
import { AuditLogModel } from '../audit/model';
import { audit, type Actor } from '../audit/service';
import { PersonModel } from '../people/model';
import { isInScope, type ScopeUser } from '../people/scope';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from './model';

/** Lookups `user` has made since the campaign day began; audit entries are the record of them. */
function lookupsToday(user: Actor['user'], now: Date): Promise<number> {
  return AuditLogModel.countDocuments({
    actorUserId: user._id,
    action: 'voter.lookup',
    at: { $gte: startOfCampaignDay(now) },
  });
}

async function membershipOf(cedula: string, user: ScopeUser): Promise<VoterMembership> {
  const person = await PersonModel.findOne({ cedula, deletedAt: null })
    .select({ ancestors: 1, voterSnapshot: 1, level: 1, leaderId: 1 })
    .lean();
  if (!person) return { status: 'none' };
  if (!isInScope(user, person)) return { status: 'out_of_scope' };
  const leader = person.leaderId
    ? await PersonModel.findById(person.leaderId).select({ 'voterSnapshot.fullName': 1 }).lean()
    : null;
  return {
    status: 'member',
    level: person.level,
    leaderName: leader?.voterSnapshot.fullName ?? null,
  };
}

export interface LookupOptions {
  /** Lookups allowed per user per campaign day. */
  dailyQuota: number;
  now?: Date;
}

/**
 * Consulta de Padrón (plan 2.2): the padrón card of an active Higüey voter.
 *
 * Every lookup is audited, found or not, and counts toward the user's daily quota (429 beyond it),
 * which is what keeps the padrón from being scraped one cédula at a time. Two requests racing at the
 * limit may both pass: acceptable for a quota meant to stop bulk use, not to count exactly.
 *
 * Voters who are no longer in the current padrón (`inactive`) are not found: only active voters can
 * be registered. Membership details are shown only for people in the caller's scope.
 */
export async function lookupVoter(
  actor: Actor,
  cedula: string,
  { dailyQuota, now = new Date() }: LookupOptions,
): Promise<VoterCard> {
  if ((await lookupsToday(actor.user, now)) >= dailyQuota) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Alcanzó el límite de ${dailyQuota} consultas del padrón por día. Podrá consultar de nuevo mañana.`,
    );
  }

  const voter = await VoterModel.findOne({ _id: cedula, status: 'active' }).lean();
  await audit(
    actor,
    {
      action: 'voter.lookup',
      entity: 'voter',
      entityId: null,
      summary: `Consultó en el padrón la cédula ${formatCedula(cedula)}${voter ? '' : ' (no figura)'}.`,
    },
    null,
  );
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
