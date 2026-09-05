import { Pool, type PoolConfig } from "pg";
import { Redis } from "ioredis";

export function createDatabasePool(connectionString: string, options: PoolConfig = {}): Pool {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 1_000,
    idleTimeoutMillis: 30_000,
    ...options
  });
}

export async function checkDatabase(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}

export async function closeDatabase(pool: Pool): Promise<void> {
  await pool.end();
}

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
}

export async function checkRedis(redis: Redis): Promise<void> {
  if (redis.status === "wait") await redis.connect();
  if (redis.status === "end") throw new Error("Redis client is closed");
  await redis.ping();
}

export async function closeRedis(redis: Redis): Promise<void> {
  if (redis.status === "wait") {
    redis.disconnect();
    return;
  }
  if (redis.status !== "end") await redis.quit();
}
