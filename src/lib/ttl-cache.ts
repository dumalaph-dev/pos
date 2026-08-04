/**
 * Tiny in-process memo with a TTL, used to keep hot per-request lookups from
 * hitting Supabase on every navigation.
 *
 * Entries live in the server instance's memory (one Worker isolate on
 * Cloudflare, one process under `next start`), so this is only ever a cache —
 * never a source of truth, and never a security boundary. Postgres RLS still
 * validates every query independently.
 *
 * Promises are cached rather than values so concurrent callers share a single
 * in-flight request instead of stampeding the origin.
 */
type Entry<T> = { value: Promise<T>; expiresAt: number };

export type TtlCache<T> = {
  /** Returns the cached value, or runs `load` and remembers it for the TTL. */
  fetch: (key: string, load: () => Promise<T>) => Promise<T>;
  /** Drops a key so the next read is fresh. Call after mutating the source. */
  invalidate: (key: string) => void;
  clear: () => void;
};

export function createTtlCache<T>(ttlMs: number, maxEntries = 512): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    fetch(key, load) {
      const now = Date.now();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now) return hit.value;

      const value = load();
      // A rejected load must not be remembered, or one network blip poisons
      // the key for the whole TTL.
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });

      // Insertion-ordered eviction keeps memory bounded without a real LRU.
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }

      entries.set(key, { value, expiresAt: now + ttlMs });
      return value;
    },
    invalidate(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}
