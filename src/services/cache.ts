import type { CacheEntry } from "../types.js";
import { CACHE_TTL_MS } from "../constants.js";

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl_ms) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttl_ms: number = CACHE_TTL_MS): void {
  store.set(key, { data, timestamp: Date.now(), ttl_ms });
}

export function cacheClear(): void {
  store.clear();
}

export function cacheStats(): { entries: number; keys: string[] } {
  // Prune expired entries first
  for (const [key, entry] of store.entries()) {
    if (Date.now() - entry.timestamp > entry.ttl_ms) {
      store.delete(key);
    }
  }
  return { entries: store.size, keys: Array.from(store.keys()) };
}
