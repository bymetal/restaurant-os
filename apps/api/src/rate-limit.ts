import type { FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { ApiError } from "./errors.js";

export function createRateLimit(
  redis: Redis,
  bucket: string,
  limit: number,
  windowSeconds = 60
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    try {
      if (redis.status === "wait") await redis.connect();
      const key = `rate:${bucket}:${request.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      if (count > limit) throw new ApiError(429, "RATE_LIMITED", "Too many requests.");
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable.");
    }
  };
}
