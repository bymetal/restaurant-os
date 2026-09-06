import { createHash } from "node:crypto";
import { isOptOutMessage, normalizePhone, parseInboundCommand } from "@restaurant-os/domain";
import type { Pool, PoolClient } from "pg";
import { getConnectionByIdForBusiness, updateConnectionState } from "./evolution.js";
import { consumeLoyaltyClaimToken } from "./loyalty.js";

/**
 * Inbound Evolution webhook payload shape, coded against the documented
 * MESSAGES_UPSERT / CONNECTION_UPDATE event bodies. Verify against the
 * actually-deployed provider version in staging (see integrations/evolution/README.md).
 */
interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { id?: string; remoteJid?: string; fromMe?: boolean };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
    pushName?: string;
    state?: string;
  };
}

export type WebhookIngestResult = "processed" | "ignored" | "duplicate" | "unknown_connection";

export async function ingestEvolutionWebhook(pool: Pool, connectionId: string, rawPayload: unknown): Promise<WebhookIngestResult> {
  const connection = await getConnectionByIdForBusiness(pool, connectionId);
  if (!connection) return "unknown_connection";

  const payload = rawPayload as EvolutionWebhookPayload;
  const eventType = normalizeEventType(payload.event);
  const providerEventId = payload.data?.key?.id ?? contentHash(rawPayload);

  const stored = await pool.query<{ id: string }>(
    `INSERT INTO webhook_events (provider, connection_id, business_id, provider_event_id, event_type, payload)
     VALUES ('evolution', $1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (connection_id, provider_event_id) DO NOTHING
     RETURNING id`,
    [connectionId, connection.businessId, providerEventId, eventType, JSON.stringify(rawPayload)]
  );
  const webhookEventId = stored.rows[0]?.id;
  if (!webhookEventId) return "duplicate";

  try {
    const outcome = await routeEvent(pool, connection.businessId, eventType, payload);
    await pool.query(
      `UPDATE webhook_events SET status = $2, processed_at = now() WHERE id = $1`,
      [webhookEventId, outcome]
    );
    return outcome === "ignored" ? "ignored" : "processed";
  } catch (error) {
    await pool.query(
      `UPDATE webhook_events SET status = 'failed', processed_at = now(), attempts = attempts + 1, error = $2 WHERE id = $1`,
      [webhookEventId, error instanceof Error ? error.message : "Unknown error"]
    );
    throw error;
  }
}

async function routeEvent(
  pool: Pool,
  businessId: string,
  eventType: string,
  payload: EvolutionWebhookPayload
): Promise<"processed" | "ignored"> {
  if (eventType === "connection.update") {
    const rawState = payload.data?.state;
    const state = rawState === "open" ? "connected" : rawState === "connecting" ? "connecting" : "disconnected";
    await updateConnectionState(pool, businessId, state, null);
    return "processed";
  }

  if (eventType === "messages.upsert") {
    if (payload.data?.key?.fromMe) return "ignored";
    const remoteJid = payload.data?.key?.remoteJid;
    const text = payload.data?.message?.conversation ?? payload.data?.message?.extendedTextMessage?.text;
    if (!remoteJid || !text) return "ignored";

    let phone: string;
    try {
      phone = normalizePhone(remoteJid.split("@")[0] ?? "");
    } catch {
      return "ignored";
    }

    if (isOptOutMessage(text)) {
      await recordOptOut(pool, businessId, phone);
      return "processed";
    }

    const command = parseInboundCommand(text);
    if (!command) return "ignored";

    if (command.command === "JOIN") {
      await handleAcquisition(pool, businessId, phone, command.token, payload.data?.pushName);
      return "processed";
    }

    if (command.command === "LOYALTY_CLAIM") {
      await handleLoyaltyClaim(pool, businessId, phone, command.token, payload.data?.pushName);
      return "processed";
    }
  }

  return "ignored";
}

async function handleAcquisition(pool: Pool, businessId: string, phone: string, sourceToken: string, pushName: string | undefined): Promise<void> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const qr = await client.query<{ id: string; branchId: string | null }>(
      `SELECT id, branch_id AS "branchId" FROM qr_codes WHERE business_id = $1 AND source_token = $2 AND active = true`,
      [businessId, sourceToken]
    );
    const qrCode = qr.rows[0] ?? null;
    const customer = await findOrCreateCustomerByPhone(client, businessId, phone, pushName ?? null);
    await client.query(
      `INSERT INTO customer_consents (business_id, customer_id, type, status, source) VALUES ($1, $2, 'TRANSACTIONAL', 'granted', 'whatsapp_join')`,
      [businessId, customer.id]
    );
    if (qrCode) {
      await client.query(
        `INSERT INTO acquisition_events (business_id, qr_code_id, customer_id, event_type) VALUES ($1, $2, $3, 'customer_created')`,
        [businessId, qrCode.id, customer.id]
      );
    }
    await client.query(
      `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'customer.whatsapp_joined', 'customer', $2, $3::jsonb)`,
      [businessId, customer.id, JSON.stringify({ customerId: customer.id, phone })]
    );
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function handleLoyaltyClaim(pool: Pool, businessId: string, phone: string, token: string, pushName: string | undefined): Promise<void> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const customer = await findOrCreateCustomerByPhone(client, businessId, phone, pushName ?? null);
    await consumeLoyaltyClaimToken(client, businessId, token, customer.id);
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function recordOptOut(pool: Pool, businessId: string, phone: string): Promise<void> {
  const result = await pool.query<{ id: string }>(`SELECT id FROM customers WHERE business_id = $1 AND phone = $2`, [businessId, phone]);
  const customer = result.rows[0];
  if (!customer) return;
  await pool.query(
    `INSERT INTO customer_consents (business_id, customer_id, type, status, source, withdrawn_at) VALUES ($1, $2, 'MARKETING', 'withdrawn', 'whatsapp_opt_out', now())`,
    [businessId, customer.id]
  );
}

async function findOrCreateCustomerByPhone(client: PoolClient, businessId: string, phone: string, name: string | null): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO customers (business_id, phone, name) VALUES ($1, $2, COALESCE($3, 'WhatsApp Müşterisi'))
     ON CONFLICT (business_id, phone) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [businessId, phone, name]
  );
  const customer = result.rows[0];
  if (!customer) throw new Error("Failed to find or create customer.");
  return customer;
}

function normalizeEventType(event: string | undefined): string {
  return (event ?? "unknown").toLowerCase();
}

function contentHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
