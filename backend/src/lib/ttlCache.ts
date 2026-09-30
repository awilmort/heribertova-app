/**
 * A tiny keyed memoizer: `get(key, compute)` runs `compute` at most once per `key` every `ttlMs`,
 * sharing one in-flight promise across concurrent callers of a stale key. Used where a request
 * asks for an expensive aggregate that is fine to serve up to `ttlMs` stale (plan 8.1's
 * `/dashboards/general`), rather than a cache needing invalidation or eviction.
 */
export function createTtlCache<V>(ttlMs: number) {
  const entries = new Map<string, { expiresAt: number; value: Promise<V> }>();

  return function get(key: string, compute: () => Promise<V>): Promise<V> {
    const now = Date.now();
    const entry = entries.get(key);
    if (entry && entry.expiresAt > now) return entry.value;

    const value = compute().catch((error: unknown) => {
      entries.delete(key);
      throw error;
    });
    entries.set(key, { expiresAt: now + ttlMs, value });
    return value;
  };
}
