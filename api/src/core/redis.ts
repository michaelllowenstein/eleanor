import { createClient } from "redis";

export type RedisClient = ReturnType<typeof createClient>;

export async function createRedis(redisUrl: string): Promise<RedisClient> {
  const redis = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries) {
        return Math.min(100 * 2 ** retries, 5_000);
      }
    }
  });

  redis.on("error", (error) => {
    console.error("Redis error:", error);
  });

  await redis.connect();
  return redis as RedisClient;
}
