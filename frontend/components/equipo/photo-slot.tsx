'use client';

import type { PersonDetail, PhotoKind } from '@heribertova/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { compressForUpload } from '@/lib/imageCompress';
import { api, ApiError, personPhotoUrl } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.equipo.photos;

/**
 * One photo slot (cédula or selfie) inside `NewPersonDialog`'s photo step and `PhotoUploadDialog`:
 * pick or retake a photo, preview it, upload it. `personId` always refers to an already-created
 * person (plan 5.2/5.3's "save happens in two steps"), so nothing here can ever create a duplicate
 * member — a failed or retried upload only ever overwrites that one person's photo.
 */
export function PhotoSlot({
  personId,
  kind,
  hasPhoto,
  onUploaded,
}: {
  personId: string;
  kind: PhotoKind;
  hasPhoto: boolean;
  onUploaded: (person: PersonDetail) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: Blob) => api.uploadPersonPhoto(personId, kind, file),
    onSuccess: onUploaded,
  });

  async function pick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const compressed = await compressForUpload(file);
    setPendingFile(compressed);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(compressed);
    });
    upload.mutate(compressed);
  }

  function retry() {
    if (pendingFile) upload.mutate(pendingFile);
  }

  const label = kind === 'cedula' ? text.cedulaLabel : text.selfieLabel;
  const imageSrc = previewUrl ?? (hasPhoto ? personPhotoUrl(personId, kind) : null);
  const actionLabel = upload.isPending
    ? text.uploading
    : hasPhoto || previewUrl
      ? text.replace
      : text.add;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- a photo the backend serves via a presigned redirect, not a Next asset
            <img src={imageSrc} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">{label}</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {actionLabel}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              void pick(event.target.files);
              event.target.value = '';
            }}
          />
          {upload.isError && (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-xs text-destructive">
                {upload.error instanceof ApiError ? upload.error.message : messages.errors.generic}
              </p>
              <Button type="button" variant="outline" size="xs" onClick={retry}>
                {text.retry}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
