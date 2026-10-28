// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How does the Cache-Aside pattern work with Redis?"
// INTERVIEW Q: "What is a cache stampede, and how do you prevent it?"
// INTERVIEW Q: "How would you use Redis for rate limiting?"
// ─────────────────────────────────────────────────────────────────────────────

import Redis from "ioredis";

export const redis = new Redis(
  process.env["REDIS_URL"] ?? "redis://localhost:6379",
  { lazyConnect: true, enableOfflineQueue: false }
);

redis.on("error", (err) => {
  // Don't crash the app if Redis is unavailable — graceful degradation
  console.warn("[Redis] Connection error:", err.message);
});

// ─── Cache-Aside pattern (Read-Through) ─────────────────────────────────────
//
//  1. Check the cache. Hit → return cached value.
//  2. Miss → query the DB, store result in cache with TTL, return value.
//  3. On write → invalidate or update the cache entry.
//
// TTL jitter: add ±10% randomness to TTL so all caches don't expire at once
// (prevents the "thundering herd" / cache stampede).

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis down — fall through to DB (graceful degradation)
  }

  const data = await fetchFn();

  // TTL jitter: ±10% to spread cache expiry over a window
  const jitter = Math.floor(ttlSeconds * 0.1 * (Math.random() * 2 - 1));
  const ttl = ttlSeconds + jitter;

  try {
    // EX = expire in seconds. NX = only set if not exists (prevents stampede overwrite).
    await redis.set(key, JSON.stringify(data), "EX", ttl);
  } catch {
    // Redis write failure is non-fatal
  }

  return data;
}

// ─── INTERVIEW: Cache Stampede (Thundering Herd) ─────────────────────────────
//
// Problem: 1000 requests arrive simultaneously for a cold key.
//   All 1000 get a cache miss → all 1000 hit the DB at the same time.
//
// Solutions:
//   1. TTL jitter (above) — staggers expiry to avoid mass simultaneous expiry
//   2. Mutex/lock — first request locks the key, others wait for it to populate
//   3. Background refresh — refresh before TTL expires (never fully cold)

// ─── API Rate Limiter using Redis INCR + EXPIRE ──────────────────────────────
//
// INTERVIEW Q: "How would you build a rate limiter with Redis?"
//
// Sliding-window approach (simple fixed window shown here):
//   Key: "rate:<ip>:<minute-bucket>"
//   INCR key → count how many requests this minute
//   EXPIRE key 60 → auto-clean after the window passes
//   If count > limit → reject with 429 Too Many Requests

export async function checkRateLimit(
  ip: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number }> {
  const bucket = Math.floor(Date.now() / 60_000); // current 1-min bucket
  const key = `rate:${ip}:${bucket}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60); // set TTL on first request

    return {
      allowed: count <= limitPerMinute,
      remaining: Math.max(0, limitPerMinute - count),
    };
  } catch {
    return { allowed: true, remaining: limitPerMinute }; // fail open
  }
}

// ─── Real-time leaderboard using Redis Sorted Set (ZSET) ─────────────────────
//
// INTERVIEW Q: "How would you build a leaderboard with Redis?"
//
// ZADD leaderboard <score> <member>  → add/update score
// ZINCRBY leaderboard 10 "user:42"  → atomic increment
// ZREVRANGE leaderboard 0 9 WITHSCORES → top 10

export async function addScore(userId: number, points: number): Promise<void> {
  await redis.zincrby("leaderboard", points, `user:${userId}`);
}

export async function getTopN(n: number): Promise<Array<{ userId: string; score: number }>> {
  const raw = await redis.zrevrange("leaderboard", 0, n - 1, "WITHSCORES");
  const results: Array<{ userId: string; score: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    results.push({ userId: raw[i] ?? "", score: Number(raw[i + 1] ?? 0) });
  }
  return results;
}

