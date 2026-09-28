import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { maskCedulas } from '../../lib/mask';
import { currentUser } from '../../middleware/requireAuth';
import type { UserDocument } from '../users/model';
import { AuditLogModel, type AuditAction, type AuditEntity } from './model';

/** The logged-in user performing an action, and where the request came from. */
export interface Actor {
  user: UserDocument;
  ip: string | null;
}

/** The actor of an authenticated request. */
export function actorOf(req: Request): Actor {
  return { user: currentUser(req), ip: req.ip ?? null };
}

export interface AuditEvent {
  action: AuditAction;
  entity: AuditEntity;
  entityId: Types.ObjectId;
  /** Spanish, for the audit viewer. Any cédula in it is masked before it is stored. */
  summary: string;
}

/**
 * Records `event` in the audit log, inside the transaction (`session`) of the change it describes:
 * the change and its entry are committed together or not at all.
 */
export async function audit(
  actor: Actor,
  event: AuditEvent,
  session: ClientSession,
): Promise<void> {
  await AuditLogModel.create(
    [
      {
        actorUserId: actor.user._id,
        ...event,
        summary: maskCedulas(event.summary),
        ip: actor.ip,
        at: new Date(),
      },
    ],
    { session },
  );
}
