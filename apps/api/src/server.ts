import { loadEnv } from "@restaurant-os/config";
import {
  checkDatabase,
  closeDatabase,
  closeRedis,
  createDatabasePool,
  createRedisClient,
  checkRedis
} from "@restaurant-os/db";
import { buildApp } from "./app.js";

const env = loadEnv();
const database = createDatabasePool(env.DATABASE_URL);
const redis = createRedisClient(env.REDIS_URL);
const app = buildApp(
  {
    checkDatabase: () => checkDatabase(database),
    checkRedis: () => checkRedis(redis),
    pool: database,
    redis,
    publicRateLimitPerMinute: env.PUBLIC_RATE_LIMIT_PER_MINUTE,
    appUrl: env.APP_URL,
    appEncryptionKey: env.APP_ENCRYPTION_KEY,
    evolutionConfig: {
      baseUrl: env.EVOLUTION_BASE_URL,
      globalApiKey: env.EVOLUTION_GLOBAL_API_KEY
    },
    authConfig: {
      jwtSecret: env.JWT_SECRET,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      refreshCookieName: env.REFRESH_COOKIE_NAME,
      refreshCookieSecure: env.NODE_ENV === "production",
      allowedOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    }
  },
  {
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie"]
    },
    trustProxy: env.NODE_ENV === "production"
  }
);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await closeDatabase(database);
  await closeRedis(redis);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, "API failed to start");
  await closeDatabase(database);
  await closeRedis(redis);
  process.exitCode = 1;
}
