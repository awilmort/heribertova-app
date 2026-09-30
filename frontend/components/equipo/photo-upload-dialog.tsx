'use client';

import type { PersonSummary } from '@heribertova/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PhotoSlot } from '@/components/equipo/photo-slot';
import { messages } from '@/messages/es';

const text = messages.equipo.photoDialog;

/** "Subir foto" (plan 5.2's `docStatus` badge, plan 5.3): lets a person's photos be added or
 * replaced from the members list, for a record that was already saved without one. */
export function PhotoUploadDialog({
  person,
  onOpenChange,
  onUploaded,
}: {
  person: PersonSummary;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const [photos, setPhotos] = useState(person.photos);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{text.title(person.fullName)}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <PhotoSlot
            personId={person.id}
            kind="cedula"
            hasPhoto={photos.cedula}
            onUploaded={(updated) => {
              setPhotos(updated.photos);
              onUploaded();
            }}
          />
          <PhotoSlot
            personId={person.id}
            kind="selfie"
            hasPhoto={photos.selfie}
            onUploaded={(updated) => {
              setPhotos(updated.photos);
              onUploaded();
            }}
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {text.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
