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
    checkRedis: () => checkRedis(redis)
  },
  {
    logger: {
      level: env.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie"]
    }
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
