import { loadEnv } from "@restaurant-os/config";
import {
  checkDatabase,
  closeDatabase,
  createDatabasePool
} from "@restaurant-os/db";

const env = loadEnv();
const database = createDatabasePool(env.DATABASE_URL);
let stopping = false;

const processPendingWork = async (): Promise<void> => {
  try {
    await checkDatabase(database);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "worker_dependency_error", error: String(error) })}\n`);
  }
};

const interval = setInterval(() => {
  void processPendingWork();
}, 5_000);

process.stdout.write(`${JSON.stringify({ event: "worker_started", service: "worker" })}\n`);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  process.stdout.write(`${JSON.stringify({ event: "worker_stopping", signal })}\n`);
  await closeDatabase(database);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}
