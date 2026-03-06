/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-server deployments.
 * For multi-instance deployments, swap for Redis-backed Upstash.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

export interface RateLimitOptions {
  /** Maximum requests allowed per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Clean up expired entries occasionally
  if (Math.random() < 0.01) {
    for (const [k, v] of Array.from(store.entries())) {
      if (v.resetAt < now) store.delete(k);
    }
  }

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    const newEntry: Entry = { count: 1, resetAt: now + options.windowMs };
    store.set(key, newEntry);
    return { success: true, remaining: options.limit - 1, resetAt: newEntry.resetAt };
  }

  if (entry.count >= options.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: options.limit - entry.count, resetAt: entry.resetAt };
}
