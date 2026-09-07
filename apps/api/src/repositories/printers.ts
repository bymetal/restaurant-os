import { createHash, randomBytes } from "node:crypto";
import { type PrintDeviceRole, printJobTypeForDeviceRole } from "@restaurant-os/domain";
import type { Pool, PoolClient } from "pg";
import { ApiError } from "../errors.js";
import type { OrderResponse } from "./orders.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface PrintDeviceView {
  id: string;
  businessId: string;
  branchId: string;
  name: string;
  role: PrintDeviceRole;
  status: "online" | "offline";
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface DeviceAuthContext {
  id: string;
  businessId: string;
  branchId: string;
  role: PrintDeviceRole;
}

export interface PrintJobView {
  id: string;
  orderId: string | null;
  type: string;
  payload: unknown;
}

export async function listDevices(pool: Pool, businessId: string): Promise<PrintDeviceView[]> {
  const result = await pool.query<PrintDeviceView>(
    `SELECT id, business_id AS "businessId", branch_id AS "branchId", name, role, status,
            last_heartbeat_at AS "lastHeartbeatAt", created_at AS "createdAt"
     FROM print_devices WHERE business_id = $1 ORDER BY created_at`,
    [businessId]
  );
  return result.rows;
}

export async function registerDevice(
  pool: Pool,
  businessId: string,
  input: { branchId: string; name: string; role: PrintDeviceRole },
  actor: Actor
): Promise<{ device: PrintDeviceView; deviceKey: string }> {
  const deviceKey = randomBytes(24).toString("base64url");
  const deviceKeyHash = hashDeviceKey(deviceKey);

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string; createdAt: string }>(
      `INSERT INTO print_devices (business_id, branch_id, name, role, device_key_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at AS "createdAt"`,
      [businessId, input.branchId, input.name, input.role, deviceKeyHash]
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("Failed to register print device.");
    await insertAudit(client, {
      businessId,
      branchId: input.branchId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.printer.device.register",
      entityType: "print_device",
      entityId: row.id,
      after: { name: input.name, role: input.role },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return {
      device: {
        id: row.id,
        businessId,
        branchId: input.branchId,
        name: input.name,
        role: input.role,
        status: "offline",
        lastHeartbeatAt: null,
        createdAt: row.createdAt
      },
      deviceKey
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeDevice(pool: Pool, businessId: string, deviceId: string, actor: Actor): Promise<void> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const deleted = await client.query<{ branchId: string }>(
      `DELETE FROM print_devices WHERE id = $1 AND business_id = $2 RETURNING branch_id AS "branchId"`,
      [deviceId, businessId]
    );
    const row = deleted.rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Print device not found.");
    await insertAudit(client, {
      businessId,
      branchId: row.branchId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.printer.device.revoke",
      entityType: "print_device",
      entityId: deviceId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateDevice(pool: Pool, authorizationHeader: string | undefined): Promise<DeviceAuthContext> {
  const deviceKey = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length) : null;
  if (!deviceKey) throw new ApiError(401, "UNAUTHORIZED", "Missing device authorization header.");
  const result = await pool.query<DeviceAuthContext>(
    `SELECT id, business_id AS "businessId", branch_id AS "branchId", role
     FROM print_devices WHERE device_key_hash = $1`,
    [hashDeviceKey(deviceKey)]
  );
  const device = result.rows[0];
  if (!device) throw new ApiError(401, "UNAUTHORIZED", "Unknown print device credential.");
  return device;
}

export async function recordHeartbeat(pool: Pool, device: DeviceAuthContext): Promise<void> {
  await pool.query(`UPDATE print_devices SET status = 'online', last_heartbeat_at = now() WHERE id = $1`, [device.id]);
  await pool.query(
    `UPDATE system_issues SET status = 'resolved', resolved_at = now()
     WHERE business_id = $1 AND issue_type = 'printer_offline' AND status = 'open' AND metadata->>'deviceId' = $2`,
    [device.businessId, device.id]
  );
}

export async function claimPendingJobs(pool: Pool, device: DeviceAuthContext, limit = 5): Promise<PrintJobView[]> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const jobType = printJobTypeForDeviceRole(device.role);
    const claimed = await client.query<PrintJobView>(
      `UPDATE print_jobs SET device_id = $2, status = 'SENT', sent_at = now()
       WHERE id IN (
         SELECT id FROM print_jobs
         WHERE business_id = $1 AND branch_id = $3 AND type = $4 AND status = 'PENDING'
         ORDER BY created_at
         LIMIT $5
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, order_id AS "orderId", type, payload`,
      [device.businessId, device.id, device.branchId, jobType, limit]
    );
    await client.query("COMMIT");
    committed = true;
    return claimed.rows;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function acknowledgeJob(
  pool: Pool,
  device: DeviceAuthContext,
  jobId: string,
  outcome: { status: "PRINTED" | "FAILED"; error?: string | undefined }
): Promise<void> {
  if (outcome.status === "PRINTED") {
    const result = await pool.query(
      `UPDATE print_jobs SET status = 'PRINTED', printed_at = now() WHERE id = $1 AND device_id = $2 AND status = 'SENT'`,
      [jobId, device.id]
    );
    if (result.rowCount === 0) throw new ApiError(404, "NOT_FOUND", "Print job not found for this device.");
    return;
  }
  const result = await pool.query(
    `UPDATE print_jobs SET status = 'FAILED', attempts = attempts + 1, last_error = $3 WHERE id = $1 AND device_id = $2 AND status = 'SENT'`,
    [jobId, device.id, outcome.error ?? "Unknown print error"]
  );
  if (result.rowCount === 0) throw new ApiError(404, "NOT_FOUND", "Print job not found for this device.");
}

export async function createKitchenPrintJob(
  client: PoolClient,
  businessId: string,
  branchId: string,
  orderId: string,
  order: OrderResponse
): Promise<void> {
  const payload = {
    orderNumber: order.orderNumber,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    note: order.note,
    items: (order.items as Array<{ productNameSnapshot: string; variantNameSnapshot: string | null; quantity: number; modifiers: Array<{ name: string }> }>).map(
      (item) => ({
        name: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        quantity: item.quantity,
        modifiers: item.modifiers.map((modifier) => modifier.name)
      })
    ),
    totalMinor: order.totalMinor,
    createdAt: order.createdAt
  };
  await client.query(
    `INSERT INTO print_jobs (business_id, branch_id, order_id, type, payload) VALUES ($1, $2, $3, 'KITCHEN_RECEIPT', $4::jsonb)`,
    [businessId, branchId, orderId, JSON.stringify(payload)]
  );
}

function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
