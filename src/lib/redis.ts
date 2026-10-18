import Redis from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });

/** Fixed-window rate limiter. Returns true when the call is allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds = 60): Promise<boolean> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const [[, count]] = (await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec()) as [
    [Error | null, number],
  ];
  return count <= limit;
}
