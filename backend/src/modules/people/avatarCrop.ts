export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far the crop extends past the detected face on every side, as a fraction of the face's own
 * size — a cédula photo is already a tight headshot, so a modest margin is enough to keep a little
 * hair/chin in frame without pulling in the card's background. */
const FACE_MARGIN = 0.4;

/**
 * The square region to crop for a member's avatar: centered on the detected face, padded by
 * `FACE_MARGIN` on every side, and clamped to stay inside the source image. Kept separate from the
 * face-detection call itself so this padding/clamping math can be unit-tested without a real model
 * or image.
 */
export function computeAvatarCrop(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
): PixelRegion {
  const paddedWidth = box.width * (1 + 2 * FACE_MARGIN);
  const paddedHeight = box.height * (1 + 2 * FACE_MARGIN);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  const side = Math.min(Math.max(paddedWidth, paddedHeight), imageWidth, imageHeight);
  const left = clamp(centerX - side / 2, 0, imageWidth - side);
  const top = clamp(centerY - side / 2, 0, imageHeight - side);

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(side),
    height: Math.round(side),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
