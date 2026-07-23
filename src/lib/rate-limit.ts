// ── In-memory sliding-window rate limiter ─────────────────────────────────────
// Per-process only (fine for a single Next server / dev). Buckets live on
// globalThis so dev hot-reload doesn't reset them.

const g = globalThis as unknown as { __gvRate?: Map<string, number[]> };

function buckets(): Map<string, number[]> {
  if (!g.__gvRate) g.__gvRate = new Map();
  return g.__gvRate;
}

/**
 * Record a hit for `key`; returns true when the hit is allowed
 * (fewer than `limit` hits within the trailing `windowMs`).
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const map = buckets();
  const hits = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    map.set(key, hits);
    return false;
  }
  hits.push(now);
  map.set(key, hits);
  return true;
}
