'use client';

import type { PersonSummary } from '@heribertova/shared';
import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { personAvatarUrl, personPhotoUrl } from '@/lib/api';

const AVATAR_SIZE = { sm: 'size-8', lg: 'size-28' } as const;
const ICON_SIZE = { sm: 'size-4', lg: 'size-12' } as const;

/**
 * The headshot next to a member's name in `PeopleTable`: the face auto-cropped from their
 * cédula photo, the manually-uploaded selfie if that isn't available yet, or a placeholder icon
 * when neither photo has been uploaded.
 */
export function MemberAvatar({
  person,
  size = 'sm',
}: {
  person: PersonSummary;
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const imageSrc = person.hasAvatar
    ? personAvatarUrl(person.id)
    : person.photos.selfie
      ? personPhotoUrl(person.id, 'selfie')
      : null;

  if (!imageSrc || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ${AVATAR_SIZE[size]}`}
      >
        <UserRound className={ICON_SIZE[size]} aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a photo the backend serves via a presigned redirect, not a Next asset
    <img
      src={imageSrc}
      alt=""
      className={`shrink-0 rounded-full object-cover ${AVATAR_SIZE[size]}`}
      onError={() => setFailed(true)}
    />
  );
}
