import {
  LEADERSHIP_EVENT_REASONS,
  PERSON_LEVELS,
  type LeadershipEventReason,
  type PersonLevel,
} from '@heribertova/shared';
import { model, Schema, type Types } from 'mongoose';

export type { LeadershipEventReason };

/** One `people.level` change (HERIBERTO_ARCHITECTURE.md §5, plan 6.1): a nomination, an automatic
 * promotion at the member-count threshold, a manual promotion, or a demotion. */
export interface LeadershipEvent {
  _id: Types.ObjectId;
  personId: Types.ObjectId;
  from: PersonLevel;
  to: PersonLevel;
  reason: LeadershipEventReason;
  actorUserId: Types.ObjectId;
  /** The person's direct, non-deleted member count at the time of the event. */
  memberCount: number;
  at: Date;
}

const leadershipEventSchema = new Schema<LeadershipEvent>(
  {
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    from: { type: String, enum: PERSON_LEVELS, required: true },
    to: { type: String, enum: PERSON_LEVELS, required: true },
    reason: { type: String, enum: LEADERSHIP_EVENT_REASONS, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true },
  },
  { collection: 'leadershipEvents', versionKey: false },
);

leadershipEventSchema.index({ personId: 1, at: -1 });
// The open-aspirant-per-nominator limit: every person a given actor has nominated.
leadershipEventSchema.index({ actorUserId: 1, reason: 1 });

export const LeadershipEventModel = model<LeadershipEvent>(
  'LeadershipEvent',
  leadershipEventSchema,
);
