import { Readable } from 'node:stream';
import type { ObjectStorage } from '../src/storage/objectStorage';

/** Stands in for S3 in tests: keeps objects in memory, no emulator or network involved. */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  presignGet(key: string): Promise<string> {
    return Promise.resolve(`memory://${key}`);
  }

  presignPut(key: string): Promise<string> {
    return Promise.resolve(`memory-put://${key}`);
  }

  getStream(key: string): Promise<Readable> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object at ${key}`);
    return Promise.resolve(Readable.from(object.body));
  }

  list(prefix: string): Promise<string[]> {
    return Promise.resolve([...this.objects.keys()].filter((key) => key.startsWith(prefix)));
  }
}
