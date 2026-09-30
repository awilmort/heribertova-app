import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * What the app needs from object storage, kept small so callers (people/photos.ts) don't depend on
 * the AWS SDK directly and tests can swap in an in-memory fake (test/objectStorage.ts).
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** A time-limited URL a browser can GET the object from directly, without a session. */
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  /** A time-limited URL a browser can PUT the object to directly (plan 9.1's voter-file upload). The
   * PUT's `Content-Type` header must match `contentType` exactly, or the signature is refused. */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** Streams an object's bytes back out (plan 9.1: the API validates the voter file from here). */
  getStream(key: string): Promise<Readable>;
  /** Every object key under `prefix` (plan 9.3: finds the previous backup's objects to delete before
   * a new one is written). Assumes fewer than 1,000 keys, true of a backup's one-object-per-collection
   * layout, so it does not paginate. */
  list(prefix: string): Promise<string[]>;
}

/** The real implementation, backed by one bucket (media photos in prod; the local S3 emulator in dev). */
export function createS3ObjectStorage(client: S3Client, bucket: string): ObjectStorage {
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    presignGet(key, expiresInSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },
    presignPut(key, contentType, expiresInSeconds) {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: expiresInSeconds },
      );
    },
    async getStream(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!object.Body) throw new Error(`Object ${bucket}/${key} has no body`);
      return object.Body as Readable;
    },
    async list(prefix) {
      const result = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
      );
      return (result.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
    },
  };
}

/** Reads a stream fully into memory (plan 9.3: the backup manifest and each collection's dump are
 * small enough — the whole Atlas M0 database is capped at 512 MB — to buffer rather than stream
 * further). */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
