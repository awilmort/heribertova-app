'use client';

import type { Role } from '@heribertova/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { messages } from '@/messages/es';

const text = messages.panel.celebration;

/**
 * The promotion celebration (plan 6.2, LOE parity): `AuthenticatedShell` passes this component
 * `permissionsStale` straight from the same `/me` response that already carries the caller's
 * current `role` — by the time the flag is true, the role change (plan 6.1) has already happened,
 * so nothing here waits for a second fetch or a new login.
 *
 * `role` can only reach `team_leader` here through auto- or manual promotion (never a demotion), so
 * checking it is enough to tell promotion apart from a demotion, which reuses the same flag but gets
 * a neutral notice instead of a celebration.
 *
 * React can't derive "did this prop just turn true" without storing the previous value: comparing
 * `permissionsStale` against a `useState`-held previous value, and updating both during render, is
 * the documented alternative to a `useEffect` for reacting to a genuine prop change (not just
 * mirroring one) — see react.dev "Adjusting some state when a prop changes". `seenStale` starts at
 * `false`, not at `permissionsStale`: this component only ever mounts once `/me` has data, so a
 * fresh mount whose very first response already has `permissionsStale: true` (a reload right after
 * being promoted, before dismissing) must still open the dialog, not treat it as the starting state.
 */
export function PromotionCelebrationDialog({
  permissionsStale,
  role,
}: {
  permissionsStale: boolean;
  role: Role;
}) {
  const [open, setOpen] = useState(false);
  const [seenStale, setSeenStale] = useState(false);

  if (permissionsStale !== seenStale) {
    setSeenStale(permissionsStale);
    if (permissionsStale) setOpen(true);
  }

  const promoted = role === 'team_leader';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{promoted ? text.promotedTitle : text.roleChangedTitle}</DialogTitle>
          <DialogDescription>
            {promoted ? text.promotedBody : text.roleChangedBody(messages.roles[role])}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>{text.continue}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
