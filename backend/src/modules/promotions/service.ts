import {
  type CreatePersonRequest,
  type LeadersQuery,
  type LeadersResponse,
  type NominationRequest,
  type NominationResponse,
  type PersonLevel,
} from '@heribertova/shared';
import mongoose, { type ClientSession, type QueryFilter, type Types } from 'mongoose';
import { AppError } from '../../lib/errors';
import { audit, type Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { checkEligibility } from '../people/policy';
import { assertInScope, scopeFilter } from '../people/scope';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import { flagSessionsStale, revokeUserSessions } from '../sessions/service';
import { createLoginForPerson } from '../users/service';
import { UserModel } from '../users/model';
import { getPromotionSettings } from '../settings/service';
import { LeadershipEventModel } from './model';

export const LEVEL_LABELS: Record<PersonLevel, string> = {
  member: 'miembro',
  aspiring_leader: 'aspirante a líder',
  team_leader: 'líder de equipo',
  coordinator: 'coordinador(a)',
};

/**
 * Auto-promotion (HERIBERTO_ARCHITECTURE.md §6.2, plan 6.1): counts `leaderId`'s direct, non-deleted
 * members, and — only past the threshold — runs `updateOne({_id, level:'aspiring_leader'})`. That
 * conditional filter is what makes the promotion happen exactly once under concurrent callers: once
 * one caller's update has flipped the level, every other concurrent caller's identical update
 * matches zero documents and is a clean no-op, whatever order their reads landed in. Call this
 * inside the same transaction as whatever changed the member count (a registration, a soft delete,
 * or a nomination's initial members), so a promotion never survives a rolled-back triggering write.
 */
export async function onMemberCountChanged(
  actor: Actor,
  leaderId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const settings = await getPromotionSettings(session);
  const memberCount = await PersonModel.countDocuments({ leaderId, deletedAt: null }).session(
    session,
  );
  if (memberCount < settings.autoPromotionThreshold) return;

  const result = await PersonModel.updateOne(
    { _id: leaderId, level: 'aspiring_leader' },
    { level: 'team_leader' },
    { session },
  );
  if (result.matchedCount === 0) return;

  const person = await PersonModel.findById(leaderId).session(session).lean();
  const user = await UserModel.findOne({ personId: leaderId }).session(session);
  if (!person || !user) throw new Error(`Promoted aspirant ${leaderId.toString()} has no login`);

  await UserModel.updateOne({ _id: user._id }, { role: 'team_leader' }, { session });
  await flagSessionsStale(user._id, session);
  await LeadershipEventModel.create(
    [
      {
        personId: leaderId,
        from: 'aspiring_leader',
        to: 'team_leader',
        reason: 'auto_threshold',
        actorUserId: actor.user._id,
        memberCount,
        at: new Date(),
      },
    ],
    { session },
  );
  await audit(
    actor,
    {
      action: 'person.promoted',
      entity: 'person',
      entityId: leaderId,
      summary: `${person.cedula} alcanzó ${memberCount} miembros y fue promovido(a) automáticamente a líder de equipo.`,
    },
    session,
  );
}

/** Only a team leader is restricted to their own direct team (or a brand-new person, who becomes
 * one by nomination itself); every other role with `leaders.nominate` uses the normal people scope. */
function assertNomineeInScope(actor: Actor, nominee: Person): void {
  if (actor.user.role === 'team_leader') {
    if (!nominee.leaderId?.equals(actor.user.personId)) {
      throw new AppError(403, 'FORBIDDEN', 'Solo puede nominar a alguien de su propio equipo.');
    }
    return;
  }
  assertInScope(actor.user, nominee);
}

/** The nominee: an existing `people` record promoted in place, or a fresh one sponsored by the
 * nominator (an administrative registration, like appointing a coordinator — no consent checkbox,
 * unlike the initial members registered under them just below). */
async function findOrCreateNominee(
  actor: Actor,
  request: NominationRequest,
  session: ClientSession,
): Promise<Person> {
  const existing = await PersonModel.findOne({ cedula: request.nomineeCedula, deletedAt: null })
    .session(session)
    .lean();
  if (existing) {
    if (existing.level !== 'member') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
        nomineeCedula: [`Ya es ${LEVEL_LABELS[existing.level]}.`],
      });
    }
    assertNomineeInScope(actor, existing);
    return existing;
  }

  const voter = await VoterModel.findOne({ _id: request.nomineeCedula, status: 'active' })
    .session(session)
    .lean();
  if (!voter) {
    throw new AppError(404, 'NOT_FOUND', 'Esta cédula no figura en el padrón de Higüey.');
  }
  // Only required to get this far: the 6.3 dialog has nothing to send for an already-registered
  // nominee, so the schema itself can't require these (see nominationRequestSchema's comment).
  if (!request.nomineePhone || request.nomineePhoneWhatsapp === undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      nomineePhone: ['Esta persona no está registrada todavía: indique su teléfono.'],
    });
  }
  const recinto = await RecintoModel.findById(voter.recintoKey).session(session).lean();
  if (!recinto) throw new Error(`Voter ${voter._id} votes in unknown recinto ${voter.recintoKey}`);
  const sponsor = await PersonModel.findById(actor.user.personId)
    .select({ ancestors: 1 })
    .session(session)
    .lean();
  if (!sponsor) throw new Error(`User ${actor.user.id} has no person document`);

  const [created] = await PersonModel.create(
    [
      {
        cedula: voter._id,
        voterSnapshot: {
          fullName: voter.fullName,
          recintoKey: voter.recintoKey,
          recintoName: recinto.name,
          colegioId: voter.colegioId,
          sector: voter.sector,
          birthDate: voter.birthDate,
        },
        phone: request.nomineePhone,
        phoneWhatsapp: request.nomineePhoneWhatsapp,
        level: 'member',
        leaderId: actor.user.personId,
        ancestors: [...sponsor.ancestors, actor.user.personId],
        registeredBy: actor.user._id,
        docStatus: 'pending',
        consentAt: new Date(),
      },
    ],
    { session },
  );
  if (!created) throw new Error('PersonModel.create returned no document');
  return created;
}

/** One of `initialMembers`: a real member registration (consent required), same rules as
 * `POST /api/people` (plan 5.1), just under the nominee instead of the caller. */
async function registerInitialMember(
  actor: Actor,
  request: Omit<CreatePersonRequest, 'leaderId'>,
  index: number,
  nominee: Pick<Person, '_id' | 'ancestors'>,
  session: ClientSession,
): Promise<void> {
  const eligibility = await checkEligibility(request.cedula, actor.user, session);
  if (!eligibility.eligible) {
    throw eligibility.code === 'not_a_voter'
      ? new AppError(404, 'NOT_FOUND', eligibility.reason)
      : new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
          [`initialMembers.${index}.cedula`]: [eligibility.reason],
        });
  }
  const voter = await VoterModel.findById(request.cedula)
    .select({ birthDate: 1 })
    .session(session)
    .lean();
  if (!voter) throw new Error(`Voter ${request.cedula} disappeared mid-nomination`);

  await PersonModel.create(
    [
      {
        cedula: request.cedula,
        voterSnapshot: {
          fullName: eligibility.fullName,
          recintoKey: eligibility.recintoKey,
          recintoName: eligibility.recintoName,
          colegioId: eligibility.colegioId,
          sector: eligibility.sector,
          birthDate: voter.birthDate,
        },
        nickname: request.nickname,
        phone: request.phone,
        phoneWhatsapp: request.phoneWhatsapp,
        phone2: request.phone2,
        phone2Whatsapp: request.phone2Whatsapp,
        email: request.email,
        level: 'member',
        leaderId: nominee._id,
        ancestors: [...nominee.ancestors, nominee._id],
        registeredBy: actor.user._id,
        docStatus: 'pending',
        consentAt: new Date(),
      },
    ],
    { session },
  );
}

/** At most `maxOpenAspirantsPerNominator` people the caller has nominated may still be aspirants
 * (not yet promoted or demoted) at once (HERIBERTO_ARCHITECTURE.md §6.2, LOE parity: "El usuario ya
 * tiene un APCB registrado"). This is a pre-check, not itself inside the nomination's transaction:
 * a rare race between two nominations from the very same user at the very same instant is not the
 * concurrency guarantee this phase is about (that is the auto-promotion threshold, see
 * `onMemberCountChanged`) — worst case, that user briefly holds one aspirant over the limit. */
async function assertOpenAspirantLimit(actor: Actor, maxOpenAspirants: number): Promise<void> {
  const nominatedIds = await LeadershipEventModel.distinct('personId', {
    actorUserId: actor.user._id,
    reason: 'nominated',
  });
  const openCount = await PersonModel.countDocuments({
    _id: { $in: nominatedIds },
    level: 'aspiring_leader',
  });
  if (openCount >= maxOpenAspirants) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      nomineeCedula: ['Ya tiene un aspirante sin promover. Espere a que complete su equipo.'],
    });
  }
}

/**
 * `POST /api/promotions/nominations` (plan 6.1): nominates `request.nomineeCedula` as an aspiring
 * leader and registers `request.initialMembers` under them, in one transaction — the whole thing
 * either lands or nothing does, so a rejected member never leaves a half-created aspirant behind.
 */
export async function nominate(
  actor: Actor,
  request: NominationRequest,
): Promise<NominationResponse> {
  const settings = await getPromotionSettings();
  if (request.initialMembers.length < settings.nominationMinInitialMembers) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      initialMembers: [
        `Debe registrar al menos ${settings.nominationMinInitialMembers} miembros iniciales.`,
      ],
    });
  }
  await assertOpenAspirantLimit(actor, settings.maxOpenAspirantsPerNominator);

  return mongoose.connection.transaction(async (session) => {
    const nominee = await findOrCreateNominee(actor, request, session);
    const nomineeRef = { _id: nominee._id, ancestors: nominee.ancestors };

    for (const [index, member] of request.initialMembers.entries()) {
      await registerInitialMember(actor, member, index, nomineeRef, session);
    }

    await PersonModel.updateOne({ _id: nominee._id }, { level: 'aspiring_leader' }, { session });
    const user = await createLoginForPerson(nominee, 'aspiring_leader', { session });

    await LeadershipEventModel.create(
      [
        {
          personId: nominee._id,
          from: 'member',
          to: 'aspiring_leader',
          reason: 'nominated',
          actorUserId: actor.user._id,
          memberCount: request.initialMembers.length,
          at: new Date(),
        },
      ],
      { session },
    );
    await audit(
      actor,
      {
        action: 'person.nominated',
        entity: 'person',
        entityId: nominee._id,
        summary: `Nominó a ${nominee.cedula} como aspirante a líder.`,
      },
      session,
    );

    // A generous `nominationMinInitialMembers` setting (≥ the auto-promotion threshold) could cross
    // it right away; harmless and correct either way, since the conditional update is a no-op
    // otherwise.
    await onMemberCountChanged(actor, nominee._id, session);

    return { personId: nominee._id.toHexString(), userId: user._id.toHexString() };
  });
}

async function loadActivePerson(personId: string): Promise<Person> {
  const person = await PersonModel.findOne({ _id: personId, deletedAt: null }).lean();
  if (!person) throw new AppError(404, 'NOT_FOUND', 'No encontramos a esa persona.');
  return person;
}

/** `POST /api/promotions/:personId/promote` (plan 6.1): the only manual promotion is an early
 * aspiring-leader → team-leader move (the same transition auto-promotion makes at the threshold);
 * becoming an aspirant in the first place is always a nomination, never a manual promotion. */
export async function promoteManual(actor: Actor, personId: string, reason: string): Promise<void> {
  const person = await loadActivePerson(personId);
  if (person.level !== 'aspiring_leader') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      id: ['Solo se puede promover manualmente a un aspirante a líder.'],
    });
  }
  const memberCount = await PersonModel.countDocuments({ leaderId: person._id, deletedAt: null });

  await mongoose.connection.transaction(async (session) => {
    await PersonModel.updateOne({ _id: person._id }, { level: 'team_leader' }, { session });
    const user = await UserModel.findOne({ personId: person._id }).session(session);
    if (!user) throw new Error(`Aspirant ${person._id.toString()} has no login`);
    await UserModel.updateOne({ _id: user._id }, { role: 'team_leader' }, { session });
    await flagSessionsStale(user._id, session);
    await LeadershipEventModel.create(
      [
        {
          personId: person._id,
          from: 'aspiring_leader',
          to: 'team_leader',
          reason: 'manual',
          actorUserId: actor.user._id,
          memberCount,
          at: new Date(),
        },
      ],
      { session },
    );
    await audit(
      actor,
      {
        action: 'person.promoted',
        entity: 'person',
        entityId: person._id,
        summary: `Promovió manualmente a ${person.cedula} a líder de equipo: ${reason}`,
      },
      session,
    );
  });
}

/** One step down the ladder from `level`; demotion never skips a level and never applies above
 * team_leader (a coordinator's level comes from an appointment, plan 4.3, not this ladder). */
function demotionTarget(level: PersonLevel): PersonLevel {
  if (level === 'team_leader') return 'aspiring_leader';
  if (level === 'aspiring_leader') return 'member';
  throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
    id: ['Solo se puede degradar a un líder de equipo o un aspirante a líder.'],
  });
}

/** `POST /api/promotions/:personId/demote` (plan 6.1): demotion is never automatic. Demoting all
 * the way to `member` deactivates the login instead of leaving it with an invalid role — plain
 * members never log in (HERIBERTO_ARCHITECTURE.md §2) — and revokes its sessions outright, unlike
 * a role step-down, which only needs the nav to refresh (`flagSessionsStale`), not a new login. */
export async function demoteManual(actor: Actor, personId: string, reason: string): Promise<void> {
  const person = await loadActivePerson(personId);
  const target = demotionTarget(person.level);
  const memberCount = await PersonModel.countDocuments({ leaderId: person._id, deletedAt: null });

  await mongoose.connection.transaction(async (session) => {
    await PersonModel.updateOne({ _id: person._id }, { level: target }, { session });
    const user = await UserModel.findOne({ personId: person._id }).session(session);
    if (!user) throw new Error(`${person._id.toString()} has no login`);

    if (target === 'member') {
      await UserModel.updateOne({ _id: user._id }, { isActive: false }, { session });
      await revokeUserSessions(user._id, { session });
    } else {
      await UserModel.updateOne({ _id: user._id }, { role: target }, { session });
      await flagSessionsStale(user._id, session);
    }

    await LeadershipEventModel.create(
      [
        {
          personId: person._id,
          from: person.level,
          to: target,
          reason: 'demoted',
          actorUserId: actor.user._id,
          memberCount,
          at: new Date(),
        },
      ],
      { session },
    );
    await audit(
      actor,
      {
        action: 'person.demoted',
        entity: 'person',
        entityId: person._id,
        summary: `Degradó a ${person.cedula} de ${LEVEL_LABELS[person.level]} a ${LEVEL_LABELS[target]}: ${reason}`,
      },
      session,
    );
  });
}

/**
 * `GET /api/leaders?level=` (plan 6.3, `/lideres`): aspirants and team leaders in the caller's scope
 * (the same `scopeFilter` every other people query uses), each with their direct team for the
 * page's expandable rows — small enough to embed rather than add a second endpoint just for it.
 */
export async function listLeaders(actor: Actor, query: LeadersQuery): Promise<LeadersResponse> {
  const settings = await getPromotionSettings();
  const levels: PersonLevel[] = query.level ? [query.level] : ['aspiring_leader', 'team_leader'];

  const conditions: QueryFilter<Person>[] = [
    { level: { $in: levels }, deletedAt: null },
    scopeFilter(actor.user),
  ];
  const leaders = await PersonModel.find({ $and: conditions })
    .sort({ 'voterSnapshot.fullName': 1 })
    .lean();

  const items = await Promise.all(
    leaders.map(async (leader) => {
      const team = await PersonModel.find({ leaderId: leader._id, deletedAt: null })
        .select({ cedula: 1, 'voterSnapshot.fullName': 1, docStatus: 1 })
        .sort({ 'voterSnapshot.fullName': 1 })
        .lean();
      return {
        id: leader._id.toHexString(),
        cedula: leader.cedula,
        fullName: leader.voterSnapshot.fullName,
        // Narrowed by the `$in` filter above: every result is one of the two leader levels.
        level: leader.level as 'aspiring_leader' | 'team_leader',
        recintoName: leader.voterSnapshot.recintoName,
        sector: leader.voterSnapshot.sector,
        memberCount: team.length,
        goal:
          leader.level === 'aspiring_leader' ? settings.autoPromotionThreshold : settings.teamGoal,
        team: team.map((member) => ({
          id: member._id.toHexString(),
          cedula: member.cedula,
          fullName: member.voterSnapshot.fullName,
          docStatus: member.docStatus,
        })),
      };
    }),
  );

  return { items };
}
