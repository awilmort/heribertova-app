import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

/**
 * Connects mongoose to a database private to the calling test file, empties it before each test
 * and drops it at the end. Call once at the top level of a test file.
 */
export function useTestDatabase(): void {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

/** Opens the connection for this test file (also used to reconnect after simulating an outage). */
export async function connectTestDatabase(): Promise<void> {
  await mongoose.connect(inject('mongoUri'), { dbName: `test-${randomUUID()}` });
}
