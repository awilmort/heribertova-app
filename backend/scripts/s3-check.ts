// Proves the configured S3 credentials can put, get and delete objects in every bucket the API
// writes to. Locally it runs against the emulator (`pnpm dev:up` first); in production (plan 10.1)
// run it with the prod environment to verify the least-privilege key.
//
//   pnpm --filter @heribertova/backend s3:check
import { loadEnv } from '../src/config/env';
import { createS3Client, verifyBucketReadWrite } from '../src/storage/s3';

const env = loadEnv();
const client = createS3Client(env);
const target = env.S3_ENDPOINT ?? `AWS ${env.AWS_REGION}`;

let failed = false;
for (const bucket of [env.S3_MEDIA_BUCKET, env.S3_IMPORTS_BUCKET]) {
  try {
    await verifyBucketReadWrite(client, bucket);
    console.log(`ok    ${bucket} (${target}): put, get and delete succeeded`);
  } catch (err) {
    failed = true;
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`FAIL  ${bucket} (${target}): ${reason}`);
  }
}

client.destroy();
process.exitCode = failed ? 1 : 0;
