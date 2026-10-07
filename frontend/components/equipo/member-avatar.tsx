'use client';

import type { PersonSummary } from '@heribertova/shared';
import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { personAvatarUrl, personPhotoUrl } from '@/lib/api';

/**
 * The small headshot next to a member's name in `PeopleTable`: the face auto-cropped from their
 * cédula photo, the manually-uploaded selfie if that isn't available yet, or a placeholder icon
 * when neither photo has been uploaded.
 */
export function MemberAvatar({ person }: { person: PersonSummary }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = person.hasAvatar
    ? personAvatarUrl(person.id)
    : person.photos.selfie
      ? personPhotoUrl(person.id, 'selfie')
      : null;

  if (!imageSrc || failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserRound className="size-4" aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a photo the backend serves via a presigned redirect, not a Next asset
    <img
      src={imageSrc}
      alt=""
      className="size-8 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
