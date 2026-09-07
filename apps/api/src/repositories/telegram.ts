import { randomInt } from "node:crypto";
import { TelegramClient, type TelegramConfig } from "@restaurant-os/integrations";
import type { Pool } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export type TelegramConnectionState = "connecting" | "connected" | "disconnected";

export interface TelegramConnectionView {
  id: string;
  connectionState: TelegramConnectionState;
  botUsername: string | null;
  chatId: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
  lastSeenAt: string | null;
}

const LINK_CODE_TTL_MINUTES = 15;

export async function getConnection(pool: Pool, businessId: string): Promise<TelegramConnectionView | null> {
  const result = await pool.query<TelegramConnectionView>(
    `SELECT id, connection_state AS "connectionState", instance_name AS "botUsername", chat_id AS "chatId",
            link_code AS "linkCode", link_code_expires_at AS "linkCodeExpiresAt", last_seen_at AS "lastSeenAt"
     FROM integration_connections WHERE business_id = $1 AND provider = 'telegram'`,
    [businessId]
  );
  return result.rows[0] ?? null;
}

export async function startLinking(
  pool: Pool,
  businessId: string,
  telegramConfig: TelegramConfig,
  appUrl: string,
  webhookSecret: string,
  actor: Actor
): Promise<TelegramConnectionView> {
  const existing = await getConnection(pool, businessId);
  if (existing?.connectionState === "connected") {
    throw new ApiError(409, "INTEGRATION_ALREADY_CONNECTED", "Telegram is already connected.");
  }

  const telegramClient = new TelegramClient(telegramConfig);
  const bot = await telegramClient.getMe().catch(() => null);
  await telegramClient.setWebhook(`${appUrl}/v1/webhooks/telegram`, webhookSecret).catch(() => undefined);

  const linkCode = randomInt(100_000, 999_999).toString();

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const upserted = await dbClient.query<{ id: string }>(
      `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, webhook_state, link_code, link_code_expires_at)
       VALUES ($1, 'telegram', $2, 'connecting', 'configured', $3, now() + interval '${LINK_CODE_TTL_MINUTES} minutes')
       ON CONFLICT (business_id, provider) DO UPDATE SET
         instance_name = EXCLUDED.instance_name,
         connection_state = 'connecting',
         webhook_state = 'configured',
         link_code = EXCLUDED.link_code,
         link_code_expires_at = EXCLUDED.link_code_expires_at,
         updated_at = now()
       RETURNING id`,
      [businessId, bot?.username ?? "telegram-bot", linkCode]
    );
    const connectionId = upserted.rows[0]?.id;
    if (!connectionId) throw new Error("Failed to create telegram integration connection.");
    await insertAudit(dbClient, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.integration.telegram.link_start",
      entityType: "integration_connection",
      entityId: connectionId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    dbClient.release();
  }

  const connection = await getConnection(pool, businessId);
  if (!connection) throw new Error("Failed to load telegram connection after linking.");
  return connection;
}

export async function disconnect(pool: Pool, businessId: string, actor: Actor): Promise<void> {
  const connection = await getConnection(pool, businessId);
  if (!connection) throw new ApiError(404, "NOT_FOUND", "No Telegram connection found.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE integration_connections SET connection_state = 'disconnected', chat_id = NULL, link_code = NULL, updated_at = now()
       WHERE business_id = $1 AND provider = 'telegram'`,
      [businessId]
    );
    await client.query(
      `UPDATE integration_health SET status = 'disconnected', last_checked_at = now() WHERE business_id = $1 AND integration_type = 'telegram'`,
      [businessId]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.integration.telegram.disconnect",
      entityType: "integration_connection",
      entityId: connection.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmLink(pool: Pool, code: string, chatId: string, telegramConfig: TelegramConfig): Promise<string | null> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const matched = await client.query<{ id: string; businessId: string }>(
      `UPDATE integration_connections SET chat_id = $2, connection_state = 'connected', link_code = NULL, link_code_expires_at = NULL, last_seen_at = now(), updated_at = now()
       WHERE provider = 'telegram' AND link_code = $1 AND link_code_expires_at > now()
       RETURNING id, business_id AS "businessId"`,
      [code, chatId]
    );
    const row = matched.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      committed = true;
      return null;
    }
    await client.query(
      `INSERT INTO integration_health (business_id, integration_type, status, last_checked_at)
       VALUES ($1, 'telegram', 'connected', now())
       ON CONFLICT (business_id, integration_type) DO UPDATE SET status = 'connected', last_checked_at = now()`,
      [row.businessId]
    );
    await client.query("COMMIT");
    committed = true;
    await new TelegramClient(telegramConfig)
      .sendMessage(chatId, "✅ Restaurant OS Telegram bağlantısı kuruldu. Yeni siparişler bu sohbete düşecek.")
      .catch(() => undefined);
    return row.businessId;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveConnectionByChatId(pool: Pool, chatId: string): Promise<{ id: string; businessId: string } | null> {
  const result = await pool.query<{ id: string; businessId: string }>(
    `SELECT id, business_id AS "businessId" FROM integration_connections
     WHERE provider = 'telegram' AND chat_id = $1 AND connection_state = 'connected'`,
    [chatId]
  );
  return result.rows[0] ?? null;
}
