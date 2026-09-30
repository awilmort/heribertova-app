import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppError } from '../../lib/errors';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 80;

/**
 * `POST /api/people/:id/photos/:kind` (plan 5.2). Checks the bytes really are a JPEG/PNG/HEIC (a
 * renamed non-image is rejected regardless of its extension or declared Content-Type), then
 * re-encodes to a JPEG capped at 1600px on the longest side, quality 80. Re-encoding drops the
 * source's metadata (EXIF, including GPS) since it is never carried over explicitly.
 */
export async function processPersonPhoto(buffer: Buffer): Promise<Buffer> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_MIME_TYPES.has(type.mime)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El archivo debe ser una foto JPEG, PNG o HEIC.', {
      photo: ['El archivo debe ser una foto JPEG, PNG o HEIC.'],
    });
  }
  return sharp(buffer)
    .rotate() // auto-orient from the source's EXIF orientation before it is stripped below
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}
