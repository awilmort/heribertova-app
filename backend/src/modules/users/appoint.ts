import { outranks, type AppointableRole, type AppointUserRequest } from '@heribertova/shared';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { AppError } from '../../lib/errors';
import { audit, type Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { assertKnownRecintos } from '../recintos/validate';
import { VoterModel } from '../voters/model';
import { createLoginForPerson } from './service';
import { UserModel, type UserDocument } from './model';

const ROLE_LABELS: Record<AppointableRole, string> = {
  general_coordinator: 'coordinador(a) general',
  recinto_coordinator: 'coordinador(a) de recinto',
};

/**
 * The person behind `request.cedula`: an existing `people` record (a member appointed to lead), or
 * a fresh one built from an active Higüey voter who is not a member yet. `phone`/`phoneWhatsapp` are
 * used only in the second case; a full registration policy (photos, consent) is plan 5.1's, not an
 * administrative appointment's.
 */
async function personFor(
  request: AppointUserRequest,
  registeredBy: Types.ObjectId,
  session: ClientSession,
): Promise<Person> {
  const existing = await PersonModel.findOne({ cedula: request.cedula, deletedAt: null })
    .session(session)
    .lean();
  if (existing) return existing;

  const voter = await VoterModel.findOne({ _id: request.cedula, status: 'active' })
    .session(session)
    .lean();
  if (!voter) {
    throw new AppError(404, 'NOT_FOUND', 'Esta cédula no figura en el padrón de Higüey.');
  }
  if (!request.phone) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      'body.phone': ['El teléfono es obligatorio para una persona que aún no es miembro.'],
    });
  }
  const recinto = await RecintoModel.findById(voter.recintoKey).session(session).lean();
  if (!recinto) throw new Error(`Voter ${voter._id} votes in unknown recinto ${voter.recintoKey}`);

  const [person] = await PersonModel.create(
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
        phone: request.phone,
        phoneWhatsapp: request.phoneWhatsapp ?? true,
        level: 'coordinator',
        registeredBy,
        docStatus: 'pending',
        // An administrative appointment, not self-registration: the appointing coordinator vouches
        // for them, so there is no consent checkbox to record here (that is plan 5.1's flow).
        consentAt: new Date(),
      },
    ],
    { session },
  );
  if (!person) throw new Error('PersonModel.create returned no document');
  return person;
}

/**
 * `POST /api/users` (plan 4.3): appoints a general or recinto coordinator from an existing voter,
 * creating their `people` record if they are not a member yet, plus a login on the default (birth
 * date) password. The caller must outrank `request.role`, which already keeps a general coordinator
 * from appointing another one, and everyone from appointing the superadmin (never in
 * `APPOINTABLE_ROLES` to begin with).
 */
export async function appointCoordinator(
  actor: Actor,
  request: AppointUserRequest,
): Promise<UserDocument> {
  if (!outranks(actor.user.role, request.role)) {
    throw new AppError(403, 'FORBIDDEN', 'No puede nombrar este rol.');
  }
  await assertKnownRecintos(request.recintoScopes, 'body.recintoScopes');

  return mongoose.connection.transaction(async (session) => {
    const person = await personFor(request, actor.user._id, session);

    if (await UserModel.exists({ personId: person._id }).session(session)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
        'body.cedula': ['Esta persona ya tiene una cuenta de acceso.'],
      });
    }

    const user = await createLoginForPerson(person, request.role, {
      recintoScopes: request.recintoScopes,
      session,
    });
    await audit(
      actor,
      {
        action: 'user.appointed',
        entity: 'user',
        entityId: user._id,
        summary: `Nombró a ${user.username} como ${ROLE_LABELS[request.role]}.`,
      },
      session,
    );
    return user;
  });
}
