import { loadEnv } from "@restaurant-os/config";
import {
  checkDatabase,
  closeDatabase,
  createDatabasePool
} from "@restaurant-os/db";
import type { PoolClient } from "pg";

const env = loadEnv();
const database = createDatabasePool(env.DATABASE_URL);
let stopping = false;

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 10;
const NOTIFIABLE_EVENT_TYPES = new Set(["order.status_changed", "loyalty.stamp_earned", "customer.whatsapp_joined"]);

interface OutboxRow {
  id: string;
  businessId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const processPendingWork = async (): Promise<void> => {
  try {
    await checkDatabase(database);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "worker_dependency_error", error: String(error) })}\n`);
  }
  await processOutbox();
};

async function processOutbox(): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const batch = await client.query<OutboxRow>(
      `SELECT id, business_id AS "businessId", event_type AS "eventType", payload, attempts
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    for (const event of batch.rows) {
      try {
        if (event.businessId && NOTIFIABLE_EVENT_TYPES.has(event.eventType)) {
          await dispatchNotification(client, event);
        }
        await client.query(`UPDATE outbox_events SET published_at = now() WHERE id = $1`, [event.id]);
      } catch (error) {
        const nextAttempts = event.attempts + 1;
        const message = error instanceof Error ? error.message : "Unknown dispatch error";
        if (nextAttempts >= MAX_ATTEMPTS) {
          process.stderr.write(
            `${JSON.stringify({ event: "worker_outbox_dead_letter", outboxEventId: event.id, error: message })}\n`
          );
          await client.query(
            `UPDATE outbox_events SET published_at = now(), attempts = $2, last_error = $3 WHERE id = $1`,
            [event.id, nextAttempts, message]
          );
        } else {
          await client.query(`UPDATE outbox_events SET attempts = $2, last_error = $3 WHERE id = $1`, [event.id, nextAttempts, message]);
        }
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    process.stderr.write(`${JSON.stringify({ event: "worker_outbox_error", error: String(error) })}\n`);
  } finally {
    client.release();
  }
}

async function dispatchNotification(client: PoolClient, event: OutboxRow): Promise<void> {
  const connection = await client.query<{ instanceName: string }>(
    `SELECT instance_name AS "instanceName" FROM integration_connections
     WHERE business_id = $1 AND provider = 'evolution' AND connection_state = 'connected'`,
    [event.businessId]
  );
  const instanceName = connection.rows[0]?.instanceName;
  if (!instanceName) return;

  const phone = await resolvePhone(client, event);
  if (!phone) return;

  const response = await fetch(`${env.N8N_BASE_URL}/webhook/restaurant-os-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-inbound-secret": env.N8N_INBOUND_SECRET },
    body: JSON.stringify({ eventType: event.eventType, instanceName, phone, payload: event.payload })
  });
  if (!response.ok) throw new Error(`n8n dispatch failed with status ${response.status}`);
}

async function resolvePhone(client: PoolClient, event: OutboxRow): Promise<string | null> {
  if (event.eventType === "customer.whatsapp_joined") {
    return typeof event.payload.phone === "string" ? event.payload.phone : null;
  }
  if (event.eventType === "order.status_changed") {
    const orderId = event.payload.orderId;
    if (typeof orderId !== "string") return null;
    const result = await client.query<{ phone: string }>(`SELECT customer_phone_snapshot AS phone FROM orders WHERE id = $1`, [orderId]);
    return result.rows[0]?.phone ?? null;
  }
  if (event.eventType === "loyalty.stamp_earned") {
    const customerId = event.payload.customerId;
    if (typeof customerId !== "string") return null;
    const result = await client.query<{ phone: string }>(`SELECT phone FROM customers WHERE id = $1`, [customerId]);
    return result.rows[0]?.phone ?? null;
  }
  return null;
}

const interval = setInterval(() => {
  void processPendingWork();
}, POLL_INTERVAL_MS);

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
