import type { VoterMembership } from '@heribertova/shared';
import { messages } from '@/messages/es';

const text = messages.padron.membership;

/** A voter's membership status (plan 2.2's padrón card, plan 7.1's recinto voter list): shared so
 * both places render the same badge instead of two copies of the same three-way label logic. */
export function MembershipBadge({ membership }: { membership: VoterMembership }) {
  const label =
    membership.status === 'member'
      ? `${text.member} · ${messages.levels[membership.level]}`
      : text[membership.status];
  const registered = membership.status !== 'none';
  return (
    <span
      className={
        registered
          ? 'w-fit rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground'
          : 'w-fit rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground'
      }
    >
      {label}
    </span>
  );
}
