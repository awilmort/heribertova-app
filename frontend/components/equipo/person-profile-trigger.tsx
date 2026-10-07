'use client';

import type { PersonSummary } from '@heribertova/shared';
import { useState } from 'react';
import { EditPersonDialog } from '@/components/equipo/edit-person-dialog';
import { MemberAvatar } from '@/components/equipo/member-avatar';
import { PersonProfileDialog } from '@/components/equipo/person-profile-dialog';

/**
 * A member's avatar and name as one button: clicking either opens `PersonProfileDialog`, whose
 * "Editar" button swaps it for `EditPersonDialog`. Shared by `/equipo` and `/reportes`' member tables.
 */
export function PersonProfileTrigger({ person }: { person: PersonSummary }) {
  const [open, setOpen] = useState<'profile' | 'edit' | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen('profile')}
        className="flex items-center gap-2 text-left hover:underline"
      >
        <MemberAvatar person={person} />
        <span>
          {person.fullName}
          {person.nickname && <span className="text-muted-foreground"> · {person.nickname}</span>}
        </span>
      </button>

      {open === 'profile' && (
        <PersonProfileDialog
          person={person}
          onEdit={() => setOpen('edit')}
          onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        />
      )}
      {open === 'edit' && (
        <EditPersonDialog person={person} onOpenChange={(isOpen) => !isOpen && setOpen(null)} />
      )}
    </>
  );
}
