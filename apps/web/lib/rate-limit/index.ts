import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Tier = "api" | "ai" | "auth";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // Unix ms
}

// Lazy singletons — one per tier
let _redis: Redis | null = null;
const _limiters: Partial<Record<Tier, Ratelimit>> = {};

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

const CONFIGS: Record<Tier, { requests: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  api:  { requests: 100, window: "1 m" },
  ai:   { requests: 20,  window: "1 m" },
  auth: { requests: 10,  window: "10 m" },
};

function getLimiter(tier: Tier): Ratelimit | null {
  if (_limiters[tier]) return _limiters[tier]!;
  const redis = getRedis();
  if (!redis) return null;
  const { requests, window } = CONFIGS[tier];
  _limiters[tier] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `pedagogue:rl:${tier}`,
  });
  return _limiters[tier]!;
}

/**
 * Rate-limit an identifier by tier.
 * Returns {success: true} in local dev when Upstash env vars are not set —
 * never throws so dev workflows are unaffected.
 */
export async function rateLimit(
  identifier: string,
  tier: Tier,
): Promise<RateLimitResult> {
  const limiter = getLimiter(tier);
  if (!limiter) {
    // Local dev / no Upstash configured — pass through
    return { success: true, remaining: CONFIGS[tier].requests - 1, reset: Date.now() + 60_000 };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // Upstash outage — fail open so users aren't blocked by infra issues
    console.error("[rateLimit] Upstash error — failing open:", err);
    return { success: true, remaining: 0, reset: Date.now() + 60_000 };
  }
}
