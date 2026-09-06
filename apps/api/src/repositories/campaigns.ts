import { calculateCampaignDiscount, canTransitionCampaign, type CampaignStatus } from "@restaurant-os/domain";
import type { CreateCampaignRequest, UpdateCampaignRequest } from "@restaurant-os/contracts";
import type { Pool, PoolClient } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface CampaignView {
  id: string;
  name: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  couponCode: string;
  minOrderAmountMinor: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
}

const campaignColumns = `
  id, name, description, discount_type AS "discountType", discount_value AS "discountValue",
  coupon_code AS "couponCode", min_order_amount_minor AS "minOrderAmountMinor",
  max_redemptions AS "maxRedemptions", redemption_count AS "redemptionCount", status,
  starts_at AS "startsAt", ends_at AS "endsAt", created_at AS "createdAt"
`;

export async function listCampaigns(pool: Pool, businessId: string, status?: string): Promise<CampaignView[]> {
  const result = await pool.query<CampaignView>(
    `SELECT ${campaignColumns} FROM campaigns WHERE business_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC`,
    [businessId, status ?? null]
  );
  return result.rows;
}

export async function getCampaign(pool: Pool, businessId: string, campaignId: string): Promise<CampaignView | null> {
  const result = await pool.query<CampaignView>(`SELECT ${campaignColumns} FROM campaigns WHERE id = $1 AND business_id = $2`, [
    campaignId,
    businessId
  ]);
  return result.rows[0] ?? null;
}

export async function createCampaign(pool: Pool, businessId: string, input: CreateCampaignRequest, actor: Actor): Promise<CampaignView> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<CampaignView>(
      `
        INSERT INTO campaigns (business_id, name, description, discount_type, discount_value, coupon_code, min_order_amount_minor, max_redemptions, starts_at, ends_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING ${campaignColumns}
      `,
      [
        businessId,
        input.name,
        input.description ?? null,
        input.discountType,
        input.discountValue,
        input.couponCode,
        input.minOrderAmountMinor,
        input.maxRedemptions ?? null,
        input.startsAt,
        input.endsAt ?? null,
        actor.userId
      ]
    );
    const campaign = result.rows[0];
    if (!campaign) throw new Error("Failed to create campaign.");
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.campaign.create",
      entityType: "campaign",
      entityId: campaign.id,
      after: campaign,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return campaign;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    if (isUniqueViolation(error)) throw new ApiError(409, "CAMPAIGN_CODE_EXISTS", "A campaign with this coupon code already exists.");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCampaign(
  pool: Pool,
  businessId: string,
  campaignId: string,
  input: UpdateCampaignRequest,
  actor: Actor
): Promise<CampaignView> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const existing = await client.query<CampaignView>(
      `SELECT ${campaignColumns} FROM campaigns WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [campaignId, businessId]
    );
    const campaign = existing.rows[0];
    if (!campaign) throw new ApiError(404, "NOT_FOUND", "Campaign not found.");
    if (input.status && input.status !== campaign.status && !canTransitionCampaign(campaign.status, input.status)) {
      throw new ApiError(409, "INVALID_STATE_TRANSITION", `Cannot move campaign from ${campaign.status} to ${input.status}.`);
    }
    const result = await client.query<CampaignView>(
      `
        UPDATE campaigns SET
          name = COALESCE($3, name),
          description = COALESCE($4, description),
          discount_value = COALESCE($5, discount_value),
          min_order_amount_minor = COALESCE($6, min_order_amount_minor),
          max_redemptions = COALESCE($7, max_redemptions),
          starts_at = COALESCE($8, starts_at),
          ends_at = COALESCE($9, ends_at),
          status = COALESCE($10, status),
          updated_at = now()
        WHERE id = $1 AND business_id = $2
        RETURNING ${campaignColumns}
      `,
      [
        campaignId,
        businessId,
        input.name ?? null,
        input.description ?? null,
        input.discountValue ?? null,
        input.minOrderAmountMinor ?? null,
        input.maxRedemptions ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.status ?? null
      ]
    );
    const updated = result.rows[0];
    if (!updated) throw new Error("Failed to update campaign.");
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.campaign.update",
      entityType: "campaign",
      entityId: campaignId,
      before: campaign,
      after: updated,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return updated;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  redemptionCount: number;
  revenueMinor: number;
  discountMinor: number;
}

export async function getCampaignPerformance(pool: Pool, businessId: string, campaignId: string): Promise<CampaignPerformance | null> {
  const campaign = await getCampaign(pool, businessId, campaignId);
  if (!campaign) return null;
  const result = await pool.query<{ revenueMinor: string; discountMinor: string }>(
    `
      SELECT coalesce(sum(o.total_minor), 0)::text AS "revenueMinor", coalesce(sum(oa.amount_minor), 0)::text AS "discountMinor"
      FROM order_adjustments oa
      JOIN orders o ON o.id = oa.order_id
      WHERE oa.business_id = $1 AND oa.campaign_id = $2
    `,
    [businessId, campaignId]
  );
  const row = result.rows[0];
  return {
    campaignId,
    name: campaign.name,
    redemptionCount: campaign.redemptionCount,
    revenueMinor: Number(row?.revenueMinor ?? 0),
    discountMinor: Number(row?.discountMinor ?? 0)
  };
}

export async function getCampaignPerformanceSummary(
  pool: Pool,
  businessId: string,
  from?: string,
  to?: string
): Promise<CampaignPerformance[]> {
  const result = await pool.query<{ campaignId: string; name: string; redemptionCount: string; revenueMinor: string; discountMinor: string }>(
    `
      SELECT c.id AS "campaignId", c.name, count(DISTINCT oa.order_id)::text AS "redemptionCount",
             coalesce(sum(o.total_minor), 0)::text AS "revenueMinor", coalesce(sum(oa.amount_minor), 0)::text AS "discountMinor"
      FROM campaigns c
      LEFT JOIN order_adjustments oa ON oa.campaign_id = c.id AND oa.business_id = c.business_id
        AND ($2::timestamptz IS NULL OR oa.created_at >= $2) AND ($3::timestamptz IS NULL OR oa.created_at <= $3)
      LEFT JOIN orders o ON o.id = oa.order_id
      WHERE c.business_id = $1
      GROUP BY c.id, c.name
      ORDER BY coalesce(sum(oa.amount_minor), 0) DESC
    `,
    [businessId, from ?? null, to ?? null]
  );
  return result.rows.map((row) => ({
    campaignId: row.campaignId,
    name: row.name,
    redemptionCount: Number(row.redemptionCount),
    revenueMinor: Number(row.revenueMinor),
    discountMinor: Number(row.discountMinor)
  }));
}

export async function resolveCampaignDiscount(
  client: PoolClient,
  businessId: string,
  couponCode: string,
  subtotalMinor: number
): Promise<{ campaignId: string; discountMinor: number }> {
  const result = await client.query<{
    id: string;
    discountType: "percentage" | "fixed_amount";
    discountValue: number;
    minOrderAmountMinor: number;
    maxRedemptions: number | null;
    redemptionCount: number;
    status: CampaignStatus;
    startsAt: Date;
    endsAt: Date | null;
  }>(
    `
      SELECT id, discount_type AS "discountType", discount_value AS "discountValue",
             min_order_amount_minor AS "minOrderAmountMinor", max_redemptions AS "maxRedemptions",
             redemption_count AS "redemptionCount", status, starts_at AS "startsAt", ends_at AS "endsAt"
      FROM campaigns WHERE business_id = $1 AND coupon_code = $2 FOR UPDATE
    `,
    [businessId, couponCode.toUpperCase()]
  );
  const campaign = result.rows[0];
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Coupon code was not found.");
  const now = new Date();
  if (campaign.status !== "active" || campaign.startsAt > now) {
    throw new ApiError(400, "CAMPAIGN_NOT_ACTIVE", "This coupon is not currently active.");
  }
  if (campaign.endsAt && campaign.endsAt < now) {
    throw new ApiError(400, "CAMPAIGN_EXPIRED", "This coupon has expired.");
  }
  if (subtotalMinor < campaign.minOrderAmountMinor) {
    throw new ApiError(400, "CAMPAIGN_MINIMUM_NOT_REACHED", "Order does not meet the minimum amount for this coupon.");
  }
  if (campaign.maxRedemptions !== null && campaign.redemptionCount >= campaign.maxRedemptions) {
    throw new ApiError(409, "CAMPAIGN_LIMIT_REACHED", "This coupon has reached its redemption limit.");
  }
  const discountMinor = calculateCampaignDiscount(subtotalMinor, {
    type: campaign.discountType,
    value: campaign.discountValue
  });
  await client.query(`UPDATE campaigns SET redemption_count = redemption_count + 1, updated_at = now() WHERE id = $1`, [campaign.id]);
  return { campaignId: campaign.id, discountMinor };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}
