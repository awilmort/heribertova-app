/**
 * `/admin/padron` (plan 9.1): hashing and uploading the voter file straight to the imports bucket.
 * `apiRequest` (lib/api.ts) is fetch-based JSON only and has no upload-progress story, so this PUT
 * goes through `XMLHttpRequest`, the only browser API that reports upload progress.
 */

/** SHA-256 (hex) of `file`'s bytes, computed in the browser (Web Crypto) before anything uploads. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * PUTs `file` to a presigned URL with `contentType` (must match what the URL was signed for), calling
 * `onProgress` with a 0–1 fraction as the browser reports it.
 */
export function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`La carga del archivo falló (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('La carga del archivo falló por un error de red.'));
    xhr.send(file);
  });
}
