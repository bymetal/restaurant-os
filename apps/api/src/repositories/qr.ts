import { randomBytes } from "node:crypto";
import type { CreateQrCodeRequest } from "@restaurant-os/contracts";
import type { Pool } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface QrCodeView {
  id: string;
  type: string;
  source: string;
  branchId: string | null;
  campaignId: string | null;
  tableNumber: string | null;
  sourceToken: string;
  active: boolean;
  createdAt: string;
  scanCount: number;
  customerCount: number;
}

export async function listQrCodes(pool: Pool, businessId: string): Promise<QrCodeView[]> {
  const result = await pool.query<QrCodeView>(
    `SELECT q.id, q.type, q.source, q.branch_id AS "branchId", q.campaign_id AS "campaignId",
            q.table_number AS "tableNumber", q.source_token AS "sourceToken", q.active,
            q.created_at AS "createdAt",
            COALESCE(COUNT(a.id) FILTER (WHERE a.event_type = 'scanned'), 0)::int AS "scanCount",
            COALESCE(COUNT(DISTINCT a.customer_id) FILTER (WHERE a.event_type = 'customer_created'), 0)::int AS "customerCount"
     FROM qr_codes q
     LEFT JOIN acquisition_events a ON a.qr_code_id = q.id
     WHERE q.business_id = $1
     GROUP BY q.id
     ORDER BY q.created_at DESC`,
    [businessId]
  );
  return result.rows;
}

export async function createQrCode(pool: Pool, businessId: string, input: CreateQrCodeRequest, actor: Actor): Promise<QrCodeView> {
  if (input.branchId) await assertBranchExists(pool, businessId, input.branchId);
  const sourceToken = randomBytes(6).toString("base64url");
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; createdAt: string }>(
      `INSERT INTO qr_codes (business_id, branch_id, type, source, campaign_id, table_number, source_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at AS "createdAt"`,
      [businessId, input.branchId ?? null, input.type, input.source, input.campaignId ?? null, input.tableNumber ?? null, sourceToken]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Failed to create QR code.");
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.qr.create",
      entityType: "qr_code",
      entityId: row.id,
      after: { type: input.type, source: input.source },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return {
      id: row.id,
      type: input.type,
      source: input.source,
      branchId: input.branchId ?? null,
      campaignId: input.campaignId ?? null,
      tableNumber: input.tableNumber ?? null,
      sourceToken,
      active: true,
      createdAt: row.createdAt,
      scanCount: 0,
      customerCount: 0
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertBranchExists(pool: Pool, businessId: string, branchId: string): Promise<void> {
  const result = await pool.query(`SELECT id FROM branches WHERE id = $1 AND business_id = $2`, [branchId, businessId]);
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
}
