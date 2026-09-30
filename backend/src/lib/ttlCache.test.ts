import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from './ttlCache';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTtlCache', () => {
  it('reuses the value for the same key until the TTL expires', async () => {
    const cache = createTtlCache<number>(1000);
    let calls = 0;
    const compute = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    expect(await cache('a', compute)).toBe(1);
    expect(await cache('a', compute)).toBe(1);

    vi.advanceTimersByTime(1001);
    expect(await cache('a', compute)).toBe(2);
  });

  it('keeps separate keys independent', async () => {
    const cache = createTtlCache<string>(1000);
    expect(await cache('a', () => Promise.resolve('A'))).toBe('A');
    expect(await cache('b', () => Promise.resolve('B'))).toBe('B');
  });

  it('shares one in-flight computation across concurrent callers of a stale key', async () => {
    const cache = createTtlCache<number>(1000);
    let calls = 0;
    const compute = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(calls), 10);
      });

    const [first, second] = await Promise.all([
      cache('a', compute),
      cache('a', compute),
      vi.advanceTimersByTimeAsync(10),
    ]);

    expect(calls).toBe(1);
    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  it('does not cache a rejection, so the next call recomputes', async () => {
    const cache = createTtlCache<number>(1000);
    await expect(cache('a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(await cache('a', () => Promise.resolve(42))).toBe(42);
  });
});
