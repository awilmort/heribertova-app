import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { processPersonPhoto } from './photoProcessing';

/** A real JPEG, oversized so the resize branch is exercised, with EXIF metadata baked in exactly
 * like a phone camera photo would carry (a real phone's EXIF also carries a GPS IFD with the
 * shot's location, which is exactly what must not survive re-encoding). */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 2000, height: 1200, channels: 3, background: 'red' } })
    .withExifMerge({ IFD0: { Make: 'TestPhone', Software: 'test-fixture' } })
    .jpeg()
    .toBuffer();
}

describe('processPersonPhoto', () => {
  it('rejects a file that is not really an image, whatever its name or content-type claim', async () => {
    const fakeImage = Buffer.from('this is not a jpeg, just renamed to look like one');
    await expect(processPersonPhoto(fakeImage)).rejects.toThrow(AppError);
  });

  it('re-encodes a real photo to a JPEG capped at 1600px, with EXIF stripped', async () => {
    const source = await jpegWithExif();
    const sourceMeta = await sharp(source).metadata();
    expect(sourceMeta.exif).toBeDefined(); // sanity: the fixture really does carry EXIF

    const processed = await processPersonPhoto(source);
    const meta = await sharp(processed).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(meta.exif).toBeUndefined();
  });

  it('never enlarges a photo smaller than the cap', async () => {
    const small = await sharp({
      create: { width: 200, height: 100, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer();

    const processed = await processPersonPhoto(small);
    const meta = await sharp(processed).metadata();

    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
});
