import { randomUUID } from 'node:crypto';
import type { DocStatus, PersonDetail, PhotoKind } from '@heribertova/shared';
import mongoose from 'mongoose';
import { AppError } from '../../lib/errors';
import type { ObjectStorage } from '../../storage/objectStorage';
import { audit, type Actor } from '../audit/service';
import { extractCedulaAvatar } from './avatarExtraction';
import { PersonModel, type StoredPhoto } from './model';
import { processPersonPhoto } from './photoProcessing';
import { isVoterInactive, loadInScope, toDetail } from './service';

/** A presigned GET URL is short-lived: it only needs to survive one browser request. */
const PRESIGNED_URL_SECONDS = 5 * 60;

const PHOTO_KIND_LABELS: Record<PhotoKind, string> = { cedula: 'cédula', selfie: 'selfie' };

/** pending (no photos) -> partial (one of the two) -> complete (both). The UI decides which photo
 * to ask for next (the cédula photo first); the API only tracks how many are in. */
function docStatusFor(photos: { cedula?: StoredPhoto; selfie?: StoredPhoto }): DocStatus {
  const count = Number(Boolean(photos.cedula)) + Number(Boolean(photos.selfie));
  if (count === 0) return 'pending';
  if (count === 1) return 'partial';
  return 'complete';
}

/**
 * `POST /api/people/:id/photos/:kind` (plan 5.2): validates and re-encodes the upload
 * (`processPersonPhoto`), stores it under a fresh key, deletes the previous photo of the same kind
 * if there was one, and updates `photos`/`docStatus`.
 */
export async function uploadPersonPhoto(
  actor: Actor,
  id: string,
  kind: PhotoKind,
  file: Buffer,
  storage: ObjectStorage,
): Promise<PersonDetail> {
  const person = await loadInScope(actor, id);
  const processed = await processPersonPhoto(file);

  const key = `people/${person._id.toHexString()}/${kind}-${randomUUID()}.jpg`;
  await storage.put(key, processed, 'image/jpeg');

  const previousKey = person.photos?.[kind]?.key;
  const photos = { ...person.photos, [kind]: { key, uploadedAt: new Date() } };

  // The avatar is derived only from the cédula photo, and only overwritten when a face is actually
  // found: a bad re-upload (blurry, face cut off) just leaves whatever avatar the member already
  // had, rather than deleting a good one.
  let avatarKey = person.avatarKey;
  let previousAvatarKey: string | null = null;
  if (kind === 'cedula') {
    const avatar = await extractCedulaAvatar(processed);
    if (avatar) {
      previousAvatarKey = person.avatarKey;
      avatarKey = `people/${person._id.toHexString()}/avatar-${randomUUID()}.jpg`;
      await storage.put(avatarKey, avatar, 'image/jpeg');
    }
  }

  await mongoose.connection.transaction(async (session) => {
    await PersonModel.updateOne(
      { _id: person._id },
      { photos, docStatus: docStatusFor(photos), avatarKey },
      { session },
    );
    await audit(
      actor,
      {
        action: 'person.photo_uploaded',
        entity: 'person',
        entityId: person._id,
        summary: `Subió la foto de ${PHOTO_KIND_LABELS[kind]} de ${person.cedula}.`,
      },
      session,
    );
  });

  // Best-effort: an orphaned object in the media bucket costs nothing anyone needs to act on, but
  // failing the request over a delete that happens after the new photo is already live would not
  // help the caller.
  if (previousKey) await storage.delete(previousKey).catch(() => {});
  if (previousAvatarKey) await storage.delete(previousAvatarKey).catch(() => {});

  const updated = await PersonModel.findById(person._id).lean();
  if (!updated) throw new Error('Person disappeared mid-upload');
  return toDetail(updated, await isVoterInactive(updated.cedula));
}

/** `GET /api/people/:id/photos/:kind` (plan 5.2): a 5-minute presigned URL, after the same scope
 * check every other :id route on this person uses. */
export async function getPersonPhotoUrl(
  actor: Actor,
  id: string,
  kind: PhotoKind,
  storage: ObjectStorage,
): Promise<string> {
  const person = await loadInScope(actor, id);
  const photo = person.photos?.[kind];
  if (!photo) throw new AppError(404, 'NOT_FOUND', 'Esta persona no tiene esa foto.');
  return storage.presignGet(photo.key, PRESIGNED_URL_SECONDS);
}

/** `GET /api/people/:id/photos/:kind/download`: the same photo as `getPersonPhotoUrl`, but served as
 * an attachment named after the cédula so an admin can save it and re-upload it elsewhere. */
export async function getPersonPhotoDownloadUrl(
  actor: Actor,
  id: string,
  kind: PhotoKind,
  storage: ObjectStorage,
): Promise<string> {
  const person = await loadInScope(actor, id);
  const photo = person.photos?.[kind];
  if (!photo) throw new AppError(404, 'NOT_FOUND', 'Esta persona no tiene esa foto.');
  return storage.presignGet(photo.key, PRESIGNED_URL_SECONDS, `${person.cedula}-${kind}.jpg`);
}

/** `GET /api/people/:id/avatar` (plan 5.3's photo-extraction follow-up): same shape as
 * `getPersonPhotoUrl`, but for the derived avatar rather than a user-uploaded photo slot. */
export async function getPersonAvatarUrl(
  actor: Actor,
  id: string,
  storage: ObjectStorage,
): Promise<string> {
  const person = await loadInScope(actor, id);
  if (!person.avatarKey) throw new AppError(404, 'NOT_FOUND', 'Esta persona no tiene avatar.');
  return storage.presignGet(person.avatarKey, PRESIGNED_URL_SECONDS);
}
