import type { RequestHandler } from "express";
import type { RedisClient } from "../core/redis.js";

export function createRedisRateLimitMiddleware(
  redis: RedisClient,
  limit: number,
): RequestHandler {
  return async (request, response, next) => {
    const userId = request.eleanorSession?.data.user?.id;

    if (!userId) {
      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    const seconds = 60;
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = `rate:realtime:${userId}:${bucket}`;

    try {
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, seconds + 2);
      }

      response.setHeader("RateLimit-Limit", String(limit));
      response.setHeader(
        "RateLimit-Remaining",
        String(Math.max(0, limit - count)),
      );

      if (count > limit) {
        response.status(429).json({
          error: "Too many realtime session requests.",
          code: "RATE_LIMITED",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Redis rate limiter failed:", error);
      response.status(503).json({
        error: "Session protection unavailable.",
      });
    }
  };
}
