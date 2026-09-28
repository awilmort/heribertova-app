import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Env } from '../config/env';

export type S3Config = Pick<
  Env,
  | 'AWS_REGION'
  | 'AWS_ACCESS_KEY_ID'
  | 'AWS_SECRET_ACCESS_KEY'
  | 'S3_ENDPOINT'
  | 'S3_FORCE_PATH_STYLE'
>;

/**
 * The one place an S3 client is configured. Works unchanged against AWS (no endpoint,
 * virtual-hosted URLs) and against the local emulator (S3_ENDPOINT + path-style URLs).
 */
export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.AWS_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * True when the bucket exists and our credentials can reach it (HeadBucket, which needs
 * `s3:ListBucket` on the bucket in IAM). Bounded by a timeout so /health never hangs on a dead endpoint.
 */
export async function pingBucket(
  client: S3Client,
  bucket: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }), {
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes, reads back and deletes a small object: proves the credentials can do what the API needs
 * in `bucket` (used by `pnpm --filter @heribertova/backend s3:check`). Throws on any failure.
 * The object is deleted even when the read-back fails.
 */
export async function verifyBucketReadWrite(client: S3Client, bucket: string): Promise<void> {
  const key = `s3-check/${randomUUID()}.txt`;
  const content = `s3:check ${new Date().toISOString()}`;

  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: content, ContentType: 'text/plain' }),
  );
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const readBack = await object.Body?.transformToString();
    if (readBack !== content) {
      throw new Error(`Object ${bucket}/${key} read back with different content`);
    }
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
