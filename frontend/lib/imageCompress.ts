const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscales a picked photo on-device before it goes over the wire, so a multi-megabyte camera
 * shot doesn't sit on a slow mobile connection any longer than it has to (plan 5.3). This is
 * best-effort only: the backend re-validates and re-encodes every photo itself (plan 5.2), so if the
 * browser can't decode `file` (some HEIC photos, older browsers), the original file is returned
 * unchanged and the server does the real work.
 */
export async function compressForUpload(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      );
      return blob ?? file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
