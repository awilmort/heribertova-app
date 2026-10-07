import sharp from 'sharp';
import { computeAvatarCrop } from './avatarCrop';
import { detectFaceBox } from './faceDetection';

const AVATAR_SIZE = 256;
const JPEG_QUALITY = 80;
/** Below this, a detection is too small to be a usable headshot (e.g. a face half cut off by the
 * image edge) — treated the same as no face found. */
const MIN_CROP_PX = 20;

/**
 * The member's avatar, cropped automatically from their already-validated cédula photo (`buffer`
 * is `processPersonPhoto`'s output: a re-encoded JPEG). Returns `null` when no face is found, so
 * the caller can fall back to the selfie photo or a placeholder instead of storing a bad crop.
 * Any unexpected decoding/inference failure is treated the same way — deriving this thumbnail is
 * never allowed to fail the cédula upload it runs alongside.
 */
export async function extractCedulaAvatar(buffer: Buffer): Promise<Buffer | null> {
  try {
    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const box = await detectFaceBox(pixels, info.width, info.height);
    if (!box) return null;

    const crop = computeAvatarCrop(box, info.width, info.height);
    if (crop.width < MIN_CROP_PX || crop.height < MIN_CROP_PX) return null;

    return await sharp(buffer)
      .extract(crop)
      .resize(AVATAR_SIZE, AVATAR_SIZE)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}
