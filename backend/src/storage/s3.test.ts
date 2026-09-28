import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createS3Client, pingBucket, verifyBucketReadWrite, type S3Config } from './s3';

const localConfig: S3Config = {
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local-key',
  AWS_SECRET_ACCESS_KEY: 'local-secret',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_FORCE_PATH_STYLE: true,
};

type Send = (command: unknown, options?: { abortSignal?: AbortSignal }) => Promise<unknown>;

/** A stand-in S3Client whose `send` is the given implementation. */
function fakeClient(send: Send) {
  const spy = vi.fn(send);
  return { client: { send: spy } as unknown as S3Client, send: spy };
}

/** A fake client backed by an in-memory object map, enough for put/get/delete. */
function inMemoryClient(readBack?: (stored: string) => string) {
  const objects = new Map<string, string>();
  const fake = fakeClient((command) => {
    if (command instanceof PutObjectCommand) {
      objects.set(`${command.input.Bucket}/${command.input.Key}`, command.input.Body as string);
      return Promise.resolve({});
    }
    if (command instanceof GetObjectCommand) {
      const stored = objects.get(`${command.input.Bucket}/${command.input.Key}`) ?? '';
      const content = readBack ? readBack(stored) : stored;
      return Promise.resolve({ Body: { transformToString: () => Promise.resolve(content) } });
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(`${command.input.Bucket}/${command.input.Key}`);
      return Promise.resolve({});
    }
    return Promise.reject(new Error('unexpected command'));
  });
  return { ...fake, objects };
}

describe('createS3Client', () => {
  it('targets the configured emulator endpoint with path-style URLs and explicit credentials', async () => {
    const client = createS3Client(localConfig);

    expect(await client.config.region()).toBe('us-east-1');
    expect(client.config.forcePathStyle).toBe(true);
    expect(await client.config.endpoint?.()).toMatchObject({
      protocol: 'http:',
      hostname: 'localhost',
      port: 9000,
    });
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: 'local-key',
      secretAccessKey: 'local-secret',
    });
  });

  it('leaves the endpoint to the SDK (AWS) when S3_ENDPOINT is unset', () => {
    const client = createS3Client({
      ...localConfig,
      S3_ENDPOINT: undefined,
      S3_FORCE_PATH_STYLE: false,
    });
    expect(client.config.endpoint).toBeUndefined();
    expect(client.config.forcePathStyle).toBe(false);
  });
});

describe('pingBucket', () => {
  it('is true when HeadBucket succeeds on the given bucket', async () => {
    const { client, send } = fakeClient(() => Promise.resolve({}));

    await expect(pingBucket(client, 'media')).resolves.toBe(true);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(HeadBucketCommand);
    expect((command as HeadBucketCommand).input).toEqual({ Bucket: 'media' });
  });

  it('is false when S3 answers with an error (missing bucket, bad credentials, connection refused)', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('NotFound')));
    await expect(pingBucket(client, 'media')).resolves.toBe(false);
  });

  it('is false when S3 does not answer within the timeout', async () => {
    const { client } = fakeClient(
      (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(pingBucket(client, 'media', 10)).resolves.toBe(false);
  });
});

describe('verifyBucketReadWrite', () => {
  it('puts, reads back and deletes one object under s3-check/', async () => {
    const { client, send, objects } = inMemoryClient();

    await verifyBucketReadWrite(client, 'imports');

    const commands = send.mock.calls.map(([command]) => command);
    expect(commands.map((command) => command?.constructor)).toEqual([
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
    ]);
    const keys = commands.map((command) => (command as PutObjectCommand).input.Key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^s3-check\/[0-9a-f-]{36}\.txt$/);
    expect(
      commands.every((command) => (command as PutObjectCommand).input.Bucket === 'imports'),
    ).toBe(true);
    expect(objects.size).toBe(0);
  });

  it('fails when the object reads back different, and still deletes it', async () => {
    const { client, objects } = inMemoryClient(() => 'corrupted');

    await expect(verifyBucketReadWrite(client, 'media')).rejects.toThrow(/different content/);
    expect(objects.size).toBe(0);
  });

  it('fails when the read fails, and still deletes the object', async () => {
    const { client, objects, send } = inMemoryClient();
    const store = send.getMockImplementation()!;
    send.mockImplementation((command, options) =>
      command instanceof GetObjectCommand
        ? Promise.reject(new Error('AccessDenied'))
        : store(command, options),
    );

    await expect(verifyBucketReadWrite(client, 'media')).rejects.toThrow('AccessDenied');
    expect(objects.size).toBe(0);
  });

  it('fails without reading or deleting when the put is rejected', async () => {
    const { client, send } = fakeClient(() => Promise.reject(new Error('AccessDenied')));

    await expect(verifyBucketReadWrite(client, 'media')).rejects.toThrow('AccessDenied');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
