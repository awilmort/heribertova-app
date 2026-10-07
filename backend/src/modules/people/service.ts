import {
  hasPermission,
  type CreatePersonRequest,
  type DocStatus,
  type ListPeopleQuery,
  type ListPeopleResponse,
  type PersonDetail,
  type PersonLevel,
  type PersonScope,
  type PersonStatus,
  type PersonSummary,
  type UpdatePersonRequest,
} from '@heribertova/shared';
import mongoose, { type QueryFilter } from 'mongoose';
import { AppError } from '../../lib/errors';
import { escapeRegExp } from '../../lib/text';
import { audit, type Actor } from '../audit/service';
import { onMemberCountChanged } from '../promotions/service';
import { VoterModel } from '../voters/model';
import { checkEligibility } from './policy';
import { assertInScope, scopeFilter, superadminPersonId, type ScopeUser } from './scope';
import { PersonModel, type Person } from './model';

/** Mongo's duplicate-key error, optionally naming the index it tripped on `keyPattern`. */
function duplicateKeyOn(err: unknown, field: string): boolean {
  return (
    err instanceof mongoose.mongo.MongoServerError &&
    err.code === 11000 &&
    field in ((err.keyPattern as Record<string, unknown> | undefined) ?? {})
  );
}

function toSummary(person: Person, voterInactive: boolean): PersonSummary {
  return {
    id: person._id.toHexString(),
    cedula: person.cedula,
    fullName: person.voterSnapshot.fullName,
    nickname: person.nickname,
    recintoName: person.voterSnapshot.recintoName,
    sector: person.voterSnapshot.sector,
    level: person.level,
    status: person.status,
    docStatus: person.docStatus,
    // `.lean()` documents predating plan 5.2, or created without touching photos, have no `photos`
    // key at all (Mongoose doesn't default an unset nested path), so this never assumes it exists.
    photos: { cedula: Boolean(person.photos?.cedula), selfie: Boolean(person.photos?.selfie) },
    hasAvatar: Boolean(person.avatarKey),
    voterInactive,
    createdAt: person.createdAt.toISOString(),
  };
}

/** Whether `cedula`'s voter is `inactive` (plan 9.2: a later padrón cut dropped them). */
export async function isVoterInactive(cedula: string): Promise<boolean> {
  const voter = await VoterModel.findById(cedula).select({ status: 1 }).lean();
  return voter?.status === 'inactive';
}

/** The batched form of `isVoterInactive`, for a page of people (`listPeople`) instead of one. */
async function inactiveCedulasAmong(cedulas: readonly string[]): Promise<ReadonlySet<string>> {
  if (cedulas.length === 0) return new Set();
  const inactive = await VoterModel.find({ _id: { $in: cedulas }, status: 'inactive' })
    .select({ _id: 1 })
    .lean();
  return new Set(inactive.map((voter) => voter._id));
}

/** Reused by photos.ts, which returns the updated person the same way every other mutation does. */
export function toDetail(person: Person, voterInactive: boolean): PersonDetail {
  return {
    ...toSummary(person, voterInactive),
    phone: person.phone,
    phoneWhatsapp: person.phoneWhatsapp,
    phone2: person.phone2,
    phone2Whatsapp: person.phone2Whatsapp,
    email: person.email,
    leaderId: person.leaderId?.toHexString() ?? null,
    recintoKey: person.voterSnapshot.recintoKey,
    colegioId: person.voterSnapshot.colegioId,
    validatedAt: person.validatedAt?.toISOString() ?? null,
  };
}

/**
 * Who a new member reports to: the registering person themself (an aspirant or leader signing
 * people up directly), or a leader a coordinator picked, who must be in the coordinator's scope
 * (HERIBERTO_ARCHITECTURE.md §6.1).
 */
async function resolveLeader(
  actor: Actor,
  leaderId: string | null,
): Promise<Pick<Person, '_id' | 'ancestors'>> {
  if (!leaderId) {
    const own = await PersonModel.findById(actor.user.personId).select({ ancestors: 1 }).lean();
    if (!own) throw new Error(`User ${actor.user.id} has no person document`);
    return own;
  }
  const leader = await PersonModel.findOne({ _id: leaderId, deletedAt: null })
    .select({ ancestors: 1, voterSnapshot: 1 })
    .lean();
  if (!leader) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      'body.leaderId': ['No encontramos a ese líder.'],
    });
  }
  assertInScope(actor.user, leader);
  return leader;
}

/**
 * `POST /api/people` (plan 5.1): registers a member under `RegistrationPolicy` (plan/architecture
 * §6.1), re-checked here so a stale client-side "eligible" answer never bypasses it. An
 * `Idempotency-Key` makes a retried submit (a flaky mobile connection resending the same request)
 * return the original record instead of a duplicate-cédula error.
 */
export async function registerPerson(
  actor: Actor,
  request: CreatePersonRequest,
  idempotencyKey: string | null,
): Promise<PersonDetail> {
  if (idempotencyKey) {
    const existing = await PersonModel.findOne({
      registeredBy: actor.user._id,
      idempotencyKey,
    }).lean();
    // A retry of a registration this same call just made moments ago: its voter was active then.
    if (existing) return toDetail(existing, false);
  }

  const eligibility = await checkEligibility(request.cedula, actor.user);
  if (!eligibility.eligible) {
    throw eligibility.code === 'not_a_voter'
      ? new AppError(404, 'NOT_FOUND', eligibility.reason)
      : new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
          'body.cedula': [eligibility.reason],
        });
  }
  const leader = await resolveLeader(actor, request.leaderId);
  const voter = await VoterModel.findById(request.cedula).select({ birthDate: 1 }).lean();
  if (!voter) throw new Error(`Voter ${request.cedula} disappeared mid-registration`);

  try {
    return await mongoose.connection.transaction(async (session) => {
      const [person] = await PersonModel.create(
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
            leaderId: leader._id,
            ancestors: [...leader.ancestors, leader._id],
            registeredBy: actor.user._id,
            docStatus: 'pending',
            consentAt: new Date(),
            // Omitted (not set to null) when absent: see the schema field's comment.
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        ],
        { session },
      );
      if (!person) throw new Error('PersonModel.create returned no document');
      await audit(
        actor,
        {
          action: 'person.created',
          entity: 'person',
          entityId: person._id,
          summary: `Registró a ${person.cedula} como miembro.`,
        },
        session,
      );
      // §6.1 rule 8: run the promotion check after every insert, in the same transaction.
      await onMemberCountChanged(actor, leader._id, session);
      // The voter looked up a moment ago (above) was active, or checkEligibility would have refused.
      return toDetail(person, false);
    });
  } catch (err) {
    const isDuplicate = duplicateKeyOn(err, 'idempotencyKey') || duplicateKeyOn(err, 'cedula');
    if (!isDuplicate) throw err;

    // Whichever index reported the conflict, a concurrent request with the same key may have won
    // the race and already committed: that is a successful retry, not an error.
    if (idempotencyKey) {
      const existing = await PersonModel.findOne({
        registeredBy: actor.user._id,
        idempotencyKey,
      }).lean();
      if (existing) return toDetail(existing, false);
    }
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      'body.cedula': ['Ya está registrado(a).'],
    });
  }
}

export interface PersonFilterOptions {
  q?: string;
  status?: PersonStatus;
  docStatus?: DocStatus;
  /** Also used by `GET /api/exports/people.xlsx` (plan 6.4) with `/lideres`'s level filter. */
  level?: PersonLevel;
  sector?: string;
  recintoKey?: string;
  colegioId?: number;
  /** Distinct from `docStatus`: `'partial'` doesn't say which of the two photos is missing, and the
   * cédula photo is the one the registration flow requires (plan 8.2's "members missing photos"). */
  missingCedulaPhoto?: boolean;
  /** `'own'` (the caller's own subtree) or `'all'` (their full `scopeFilter`); omitted means `'all'`,
   * so `/reportes` and the exports module, which never set this, keep meaning the full scope they
   * always have — see `PersonScope`. */
  scope?: PersonScope;
}

/** The caller's scope (`scopeFilter`), or just their own subtree with `scope: 'own'` (`/equipo`'s
 * default), optionally narrowed by a name/cédula/nickname search, status/docStatus/level filters,
 * and `/reportes`'s own sector/recinto/colegio/missing-photo filters (plan 8.2). Shared by
 * `listPeople` and the exports module (plan 6.4), so no two callers ever drift on what "the same
 * filters" means, and `superadminPersonId` (`./scope`) applies everywhere at once. */
export async function personFilter(
  user: ScopeUser,
  options: PersonFilterOptions,
): Promise<QueryFilter<Person>> {
  const conditions: QueryFilter<Person>[] = [{ deletedAt: null }];
  conditions.push(options.scope === 'own' ? { ancestors: user.personId } : scopeFilter(user));
  const excludedId = await superadminPersonId();
  if (excludedId) conditions.push({ _id: { $ne: excludedId } });
  if (options.status) conditions.push({ status: options.status });
  if (options.docStatus) conditions.push({ docStatus: options.docStatus });
  if (options.level) conditions.push({ level: options.level });
  if (options.sector) conditions.push({ 'voterSnapshot.sector': options.sector });
  if (options.recintoKey) conditions.push({ 'voterSnapshot.recintoKey': options.recintoKey });
  if (options.colegioId !== undefined) {
    conditions.push({ 'voterSnapshot.colegioId': options.colegioId });
  }
  if (options.missingCedulaPhoto) conditions.push({ 'photos.cedula': { $exists: false } });
  if (options.q) {
    const pattern = new RegExp(escapeRegExp(options.q), 'i');
    conditions.push({
      $or: [{ 'voterSnapshot.fullName': pattern }, { nickname: pattern }, { cedula: pattern }],
    });
  }
  return { $and: conditions };
}

/** `GET /api/people` (plan 5.1): the caller's own subtree by default, or their full scope with
 * `scope=all` (`personFilter`), optionally narrowed by a name/cédula/nickname search and
 * status/docStatus filters. */
export async function listPeople(
  actor: Actor,
  query: ListPeopleQuery,
): Promise<ListPeopleResponse> {
  const filter = await personFilter(actor.user, query);
  const skip = (query.page - 1) * query.pageSize;
  const [people, total] = await Promise.all([
    PersonModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean(),
    PersonModel.countDocuments(filter),
  ]);
  const inactiveCedulas = await inactiveCedulasAmong(people.map((person) => person.cedula));
  return {
    items: people.map((person) => toSummary(person, inactiveCedulas.has(person.cedula))),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Reused by photos.ts: the same "find it, 404, then scope-check" every :id route needs. */
export async function loadInScope(actor: Actor, id: string): Promise<Person> {
  const person = await PersonModel.findOne({ _id: id, deletedAt: null }).lean();
  if (!person) throw new AppError(404, 'NOT_FOUND', 'No encontramos a esa persona.');
  assertInScope(actor.user, person);
  return person;
}

export async function getPerson(actor: Actor, id: string): Promise<PersonDetail> {
  const person = await loadInScope(actor, id);
  return toDetail(person, await isVoterInactive(person.cedula));
}

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  confirmed: 'confirmado(a)',
  excused: 'excusado(a)',
  not_contacted: 'no contactado(a)',
  deceased: 'fallecido(a)',
  resigned: 'renunció',
  sick: 'enfermo(a)',
  inactive: 'inactivo(a)',
};

/**
 * `PATCH /api/people/:id`: contact details (plan 5.1) and, only for a caller who also holds
 * `people.validate`, `status` (plan 5.4's "Validar miembro" drawer) — the route itself only
 * requires `people.update`, so a plain team leader or aspirant could otherwise slip a status
 * through the same endpoint. Setting a status stamps `validatedBy`/`validatedAt` with this call,
 * every time, even if the status is unchanged: it always means "last confirmed by, at".
 */
export async function updatePerson(
  actor: Actor,
  id: string,
  patch: UpdatePersonRequest,
): Promise<PersonDetail> {
  if (patch.status && !hasPermission(actor.user.role, 'people.validate')) {
    throw new AppError(403, 'FORBIDDEN', 'No tiene permiso para validar miembros.');
  }
  const person = await loadInScope(actor, id);
  const update = patch.status
    ? { ...patch, validatedBy: actor.user._id, validatedAt: new Date() }
    : patch;

  await mongoose.connection.transaction(async (session) => {
    await PersonModel.updateOne({ _id: person._id }, update, { session });
    await audit(
      actor,
      {
        action: 'person.updated',
        entity: 'person',
        entityId: person._id,
        summary: patch.status
          ? `Validó a ${person.cedula} como ${PERSON_STATUS_LABELS[patch.status]}.`
          : `Actualizó los datos de ${person.cedula}.`,
      },
      session,
    );
  });
  const updated = await PersonModel.findById(person._id).lean();
  if (!updated) throw new Error('Person disappeared mid-update');
  return toDetail(updated, await isVoterInactive(updated.cedula));
}

/**
 * `DELETE /api/people/:id` (plan 5.1): a soft delete with a reason, blocked while the person still
 * leads a team (their members would otherwise point at a deleted leader).
 */
export async function deletePerson(actor: Actor, id: string, reason: string): Promise<void> {
  const person = await loadInScope(actor, id);
  const hasMembers = await PersonModel.exists({ leaderId: person._id, deletedAt: null });
  if (hasMembers) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      id: ['No puede eliminar a alguien que todavía tiene miembros a su cargo.'],
    });
  }
  await mongoose.connection.transaction(async (session) => {
    await PersonModel.updateOne(
      { _id: person._id },
      { deletedAt: new Date(), deletedReason: reason },
      { session },
    );
    await audit(
      actor,
      {
        action: 'person.deleted',
        entity: 'person',
        entityId: person._id,
        summary: `Eliminó a ${person.cedula}: ${reason}`,
      },
      session,
    );
    // §6.2: re-checked on delete too, even though a departing member can only ever lower a leader's
    // count — never trigger a promotion — so this is a defensive no-op in practice, not a real path.
    if (person.leaderId) await onMemberCountChanged(actor, person.leaderId, session);
  });
}
