import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../lib/logger';
import { connectWithRetry } from './mongo';

const logger = createLogger('silent');

describe('connectWithRetry', () => {
  it('returns after the first successful attempt', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    await connectWithRetry(connect, { attempts: 3, baseDelayMs: 10, logger, wait: vi.fn() });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff until it succeeds', async () => {
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await connectWithRetry(connect, { attempts: 5, baseDelayMs: 100, logger, wait });

    expect(connect).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  it('rethrows the last error once attempts are exhausted', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('still down'));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      connectWithRetry(connect, { attempts: 3, baseDelayMs: 1, logger, wait }),
    ).rejects.toThrow('still down');
    expect(connect).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
