import type { RequestHandler } from "express";

import type { Logger } from "../core/logger.js";
import type { RedisClient } from "../core/redis.js";

/**
 * Fixed one-minute window per user, stored in Redis.
 * `keyPrefix` separates limits (realtime session starts vs telemetry batches).
 */
export function createRedisRateLimitMiddleware(
  redis: RedisClient,
  limit: number,
  options: {
    readonly keyPrefix?: string;
    readonly logger?: Logger;
    readonly message?: string;
  } = {},
): RequestHandler {
  const prefix = options.keyPrefix ?? "realtime";
  const log = options.logger?.child({ category: "ratelimit" });

  return async (request, response, next) => {
    const userId = request.eleanorSession?.data.user?.id;

    if (!userId) {
      response.status(401).json({
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    const seconds = 60;
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = `rate:${prefix}:${userId}:${bucket}`;

    try {
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, seconds + 2);
      }

      response.setHeader("RateLimit-Limit", String(limit));
      response.setHeader("RateLimit-Remaining", String(Math.max(0, limit - count)));

      if (count > limit) {
        log?.warn("ratelimit.exceeded", { prefix, limit, count });
        response.status(429).json({
          error: options.message ?? "Too many realtime session requests.",
          code: "RATE_LIMITED",
        });
        return;
      }

      next();
    } catch (error) {
      if (log) log.error("ratelimit.unavailable", { prefix, error });
      else console.error("Redis rate limiter failed:", error);
      response.status(503).json({
        error: "Session protection unavailable.",
        code: "RATE_LIMIT_UNAVAILABLE",
      });
    }
  };
}
