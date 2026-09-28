import { setTimeout as sleep } from 'node:timers/promises';
import mongoose from 'mongoose';
import type { Logger } from '../lib/logger';

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  logger: Logger;
  /** Injected so tests don't wait in real time. */
  wait?: (ms: number) => Promise<unknown>;
}

/** Calls `connect` until it succeeds, backing off exponentially; rethrows the last error after `attempts` tries. */
export async function connectWithRetry(
  connect: () => Promise<unknown>,
  { attempts, baseDelayMs, logger, wait = sleep }: RetryOptions,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await connect();
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn({ err, attempt, delayMs }, 'MongoDB connection failed; retrying');
      await wait(delayMs);
    }
  }
}

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  mongoose.set('strictQuery', true);
  await connectWithRetry(() => mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 }), {
    attempts: 5,
    baseDelayMs: 1_000,
    logger,
  });
  logger.info('MongoDB connected');
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

/** True when the connection is open and the server answers a ping. */
export async function pingMongo(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false;
  try {
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
