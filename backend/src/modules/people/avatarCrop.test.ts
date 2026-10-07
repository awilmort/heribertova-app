import { describe, expect, it } from 'vitest';
import { computeAvatarCrop } from './avatarCrop';

describe('computeAvatarCrop', () => {
  it('pads a centered face and keeps it centered', () => {
    const crop = computeAvatarCrop({ x: 400, y: 400, width: 200, height: 200 }, 1000, 1000);
    // 200 * (1 + 2*0.4) = 360, square already.
    expect(crop).toEqual({ left: 320, top: 320, width: 360, height: 360 });
  });

  it('expands the shorter side so the crop is always square', () => {
    const crop = computeAvatarCrop({ x: 400, y: 450, width: 200, height: 100 }, 1000, 1000);
    // padded: 360 x 180 -> square side is the larger, 360.
    expect(crop.width).toBe(360);
    expect(crop.height).toBe(360);
  });

  it('clamps the crop to stay inside the image when the face is near an edge', () => {
    const crop = computeAvatarCrop({ x: 0, y: 0, width: 200, height: 200 }, 1000, 1000);
    expect(crop.left).toBeGreaterThanOrEqual(0);
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(1000);
    expect(crop.top + crop.height).toBeLessThanOrEqual(1000);
  });

  it('never asks for a crop bigger than the source image', () => {
    const crop = computeAvatarCrop({ x: 50, y: 50, width: 90, height: 90 }, 100, 100);
    expect(crop).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});
