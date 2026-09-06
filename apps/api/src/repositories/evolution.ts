import { EvolutionClient, type EvolutionConfig } from "@restaurant-os/integrations";
import { encryptSecret } from "@restaurant-os/auth";
import type { Pool } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type WebhookState = "pending" | "configured" | "failing";

export interface IntegrationConnectionView {
  id: string;
  provider: "evolution";
  instanceName: string;
  connectionState: ConnectionState;
  webhookState: WebhookState;
  phone: string | null;
  lastSeenAt: string | null;
}

export async function getConnection(pool: Pool, businessId: string): Promise<IntegrationConnectionView | null> {
  const result = await pool.query<IntegrationConnectionView>(
    `SELECT id, provider, instance_name AS "instanceName", connection_state AS "connectionState",
            webhook_state AS "webhookState", phone, last_seen_at AS "lastSeenAt"
     FROM integration_connections WHERE business_id = $1 AND provider = 'evolution'`,
    [businessId]
  );
  return result.rows[0] ?? null;
}

export async function getConnectionByIdForBusiness(pool: Pool, connectionId: string): Promise<{ id: string; businessId: string; instanceName: string } | null> {
  const result = await pool.query<{ id: string; businessId: string; instanceName: string }>(
    `SELECT id, business_id AS "businessId", instance_name AS "instanceName" FROM integration_connections WHERE id = $1`,
    [connectionId]
  );
  return result.rows[0] ?? null;
}

export async function connectWhatsApp(
  pool: Pool,
  businessId: string,
  evolutionConfig: EvolutionConfig,
  appUrl: string,
  appEncryptionKey: string,
  actor: Actor
): Promise<IntegrationConnectionView & { qrCode: string | null }> {
  const existing = await getConnection(pool, businessId);
  if (existing && existing.connectionState !== "disconnected") {
    throw new ApiError(409, "INTEGRATION_ALREADY_CONNECTED", "WhatsApp is already connected or connecting.");
  }
  const instanceName = existing?.instanceName ?? `biz-${businessId.replace(/-/g, "").slice(0, 24)}`;

  const upserted = await pool.query<{ id: string }>(
    `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, webhook_state)
     VALUES ($1, 'evolution', $2, 'connecting', 'pending')
     ON CONFLICT (business_id, provider) DO UPDATE SET instance_name = EXCLUDED.instance_name, connection_state = 'connecting', webhook_state = 'pending', updated_at = now()
     RETURNING id`,
    [businessId, instanceName]
  );
  const connectionId = upserted.rows[0]?.id;
  if (!connectionId) throw new Error("Failed to create integration connection.");

  const client = new EvolutionClient(evolutionConfig);
  const instance = await client.createInstance(instanceName);
  const webhookUrl = `${appUrl}/v1/webhooks/evolution/${connectionId}`;
  const webhookState: WebhookState = await client
    .setWebhook(instanceName, webhookUrl)
    .then(() => "configured" as const)
    .catch(() => "failing" as const);
  const qr = await client.getQrCode(instanceName).catch(() => ({ base64: null, pairingCode: null }));
  const encryptedKey = encryptSecret(evolutionConfig.globalApiKey, appEncryptionKey);

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    await dbClient.query(
      `UPDATE integration_connections SET instance_id = $2, encrypted_api_key = $3, webhook_state = $4, updated_at = now() WHERE id = $1`,
      [connectionId, instance.instanceId, encryptedKey, webhookState]
    );
    await dbClient.query(
      `INSERT INTO integration_health (business_id, integration_type, status, last_checked_at)
       VALUES ($1, 'whatsapp', 'disconnected', now())
       ON CONFLICT (business_id, integration_type) DO UPDATE SET status = 'disconnected', last_checked_at = now()`,
      [businessId]
    );
    await insertAudit(dbClient, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.integration.whatsapp.connect",
      entityType: "integration_connection",
      entityId: connectionId,
      after: { instanceName },
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
  if (!connection) throw new Error("Failed to load connection after connect.");
  return { ...connection, qrCode: qr.base64 };
}

export async function disconnectWhatsApp(pool: Pool, businessId: string, evolutionConfig: EvolutionConfig, actor: Actor): Promise<void> {
  const connection = await getConnection(pool, businessId);
  if (!connection) throw new ApiError(404, "NOT_FOUND", "No WhatsApp connection found.");
  const client = new EvolutionClient(evolutionConfig);
  await client.logoutInstance(connection.instanceName).catch(() => undefined);

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    await dbClient.query(
      `UPDATE integration_connections SET connection_state = 'disconnected', updated_at = now() WHERE business_id = $1 AND provider = 'evolution'`,
      [businessId]
    );
    await dbClient.query(
      `UPDATE integration_health SET status = 'disconnected', last_checked_at = now() WHERE business_id = $1 AND integration_type = 'whatsapp'`,
      [businessId]
    );
    await insertAudit(dbClient, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.integration.whatsapp.disconnect",
      entityType: "integration_connection",
      entityId: connection.id,
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
}

export async function updateConnectionState(
  pool: Pool,
  businessId: string,
  state: ConnectionState,
  phone: string | null
): Promise<void> {
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    await dbClient.query(
      `UPDATE integration_connections SET connection_state = $2, phone = COALESCE($3, phone), last_seen_at = now(), updated_at = now()
       WHERE business_id = $1 AND provider = 'evolution'`,
      [businessId, state, phone]
    );
    const healthStatus = state === "connected" ? "connected" : "disconnected";
    await dbClient.query(
      `UPDATE integration_health SET status = $2, last_checked_at = now() WHERE business_id = $1 AND integration_type = 'whatsapp'`,
      [businessId, healthStatus]
    );
    if (healthStatus === "disconnected") {
      await dbClient.query(
        `INSERT INTO system_issues (issue_type, business_id, severity, description, status)
         SELECT 'whatsapp_disconnected', $1::uuid, 'warning', 'WhatsApp connection lost.', 'open'
         WHERE NOT EXISTS (
           SELECT 1 FROM system_issues WHERE business_id = $1::uuid AND issue_type = 'whatsapp_disconnected' AND status = 'open'
         )`,
        [businessId]
      );
    } else {
      await dbClient.query(
        `UPDATE system_issues SET status = 'resolved', resolved_at = now() WHERE business_id = $1 AND issue_type = 'whatsapp_disconnected' AND status = 'open'`,
        [businessId]
      );
    }
    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    dbClient.release();
  }
}
