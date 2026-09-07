import { createHash } from "node:crypto";
import { isOptOutMessage, normalizePhone, parseInboundCommand, parseTelegramCallbackData, parseTelegramLinkCommand } from "@restaurant-os/domain";
import { TelegramClient, type TelegramConfig } from "@restaurant-os/integrations";
import type { Pool, PoolClient } from "pg";
import { getConnectionByIdForBusiness, updateConnectionState } from "./evolution.js";
import { consumeLoyaltyClaimToken } from "./loyalty.js";
import { transitionOrderFromTelegram } from "./orders.js";
import { confirmLink, resolveConnectionByChatId } from "./telegram.js";

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

/**
 * Inbound Telegram update payload shape per the official Bot API
 * (https://core.telegram.org/bots/api#update). A single global bot serves
 * every tenant; the destination chat_id (captured during /link) is what
 * scopes an update to a business.
 */
interface TelegramUpdatePayload {
  update_id?: number;
  message?: { text?: string; chat?: { id?: number } };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
  };
}

export async function ingestTelegramWebhook(pool: Pool, telegramConfig: TelegramConfig, rawPayload: unknown): Promise<WebhookIngestResult> {
  const payload = rawPayload as TelegramUpdatePayload;
  const chatId = (payload.message?.chat?.id ?? payload.callback_query?.message?.chat?.id)?.toString();
  const connection = chatId ? await resolveConnectionByChatId(pool, chatId) : null;
  const providerEventId = payload.update_id !== undefined ? String(payload.update_id) : contentHash(rawPayload);

  const stored = await pool.query<{ id: string }>(
    `INSERT INTO webhook_events (provider, connection_id, business_id, provider_event_id, event_type, payload)
     VALUES ('telegram', $1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (connection_id, provider_event_id) DO NOTHING
     RETURNING id`,
    [connection?.id ?? null, connection?.businessId ?? null, providerEventId, payload.callback_query ? "callback_query" : "message", JSON.stringify(rawPayload)]
  );
  const webhookEventId = stored.rows[0]?.id;
  if (!webhookEventId) return "duplicate";

  try {
    const outcome = await routeTelegramEvent(pool, telegramConfig, payload);
    await pool.query(`UPDATE webhook_events SET status = $2, processed_at = now() WHERE id = $1`, [webhookEventId, outcome]);
    return outcome === "ignored" ? "ignored" : "processed";
  } catch (error) {
    await pool.query(
      `UPDATE webhook_events SET status = 'failed', processed_at = now(), attempts = attempts + 1, error = $2 WHERE id = $1`,
      [webhookEventId, error instanceof Error ? error.message : "Unknown error"]
    );
    throw error;
  }
}

async function routeTelegramEvent(pool: Pool, telegramConfig: TelegramConfig, payload: TelegramUpdatePayload): Promise<"processed" | "ignored"> {
  if (payload.message?.text && payload.message.chat?.id !== undefined) {
    const code = parseTelegramLinkCommand(payload.message.text);
    if (!code) return "ignored";
    const businessId = await confirmLink(pool, code, payload.message.chat.id.toString(), telegramConfig);
    return businessId ? "processed" : "ignored";
  }

  if (payload.callback_query?.data && payload.callback_query.message?.chat?.id !== undefined) {
    const chatId = payload.callback_query.message.chat.id.toString();
    const callbackQueryId = payload.callback_query.id;
    const telegramClient = new TelegramClient(telegramConfig);
    const connection = await resolveConnectionByChatId(pool, chatId);
    if (!connection) {
      if (callbackQueryId) await telegramClient.answerCallbackQuery(callbackQueryId, "Bağlantı bulunamadı.", true).catch(() => undefined);
      return "ignored";
    }
    const parsed = parseTelegramCallbackData(payload.callback_query.data);
    if (!parsed) {
      if (callbackQueryId) await telegramClient.answerCallbackQuery(callbackQueryId, "Geçersiz işlem.", true).catch(() => undefined);
      return "ignored";
    }
    try {
      await transitionOrderFromTelegram(pool, connection.businessId, parsed.orderId, parsed.toStatus);
      if (callbackQueryId) await telegramClient.answerCallbackQuery(callbackQueryId, "Güncellendi ✅").catch(() => undefined);
      return "processed";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sipariş güncellenemedi.";
      if (callbackQueryId) await telegramClient.answerCallbackQuery(callbackQueryId, message, true).catch(() => undefined);
      return "processed";
    }
  }

  return "ignored";
}
