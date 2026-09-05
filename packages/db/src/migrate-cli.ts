import { loadEnv } from "@restaurant-os/config";
import { closeDatabase, createDatabasePool } from "./client.js";
import { runMigrations } from "./migrate.js";

const env = loadEnv();
const pool = createDatabasePool(env.DATABASE_URL);

try {
  const migrations = await runMigrations(pool);
  process.stdout.write(`${JSON.stringify({ event: "migrations_applied", migrations })}\n`);
} finally {
  await closeDatabase(pool);
}
