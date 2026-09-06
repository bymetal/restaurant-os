import type {
  CustomerListQuery,
  CustomerNoteRequest,
  CustomerTagRequest,
  UpdateCustomerRequest
} from "@restaurant-os/contracts";
import type { Pool } from "pg";
import { ApiError } from "../errors.js";
import { assertCustomerExists } from "./loyalty.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string;
  segment: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export async function listCustomers(pool: Pool, businessId: string, query: CustomerListQuery): Promise<CustomerSummary[]> {
  const result = await pool.query<CustomerSummary>(
    `
      SELECT id, name, phone, segment, last_seen_at AS "lastSeenAt", created_at AS "createdAt"
      FROM customers
      WHERE business_id = $1
        AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR segment = $3)
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [businessId, query.q ?? null, query.segment ?? null, query.limit]
  );
  return result.rows;
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  segment: string;
  acquisitionSource: string | null;
  preferredBranchId: string | null;
  preferredFulfillment: string | null;
  birthday: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  metrics: {
    totalSpendMinor: number;
    totalSpendTrendPct: number;
    orderCount: number;
    orderCountTrendPct: number;
    avgBasketMinor: number;
    avgBasketTrendPct: number;
    lastOrder: { placedAt: Date; totalMinor: number; branchName: string } | null;
  };
}

export async function getCustomerDetail(pool: Pool, businessId: string, customerId: string): Promise<CustomerDetail | null> {
  const customer = await pool.query<{
    id: string;
    name: string | null;
    phone: string;
    segment: string;
    acquisitionSource: string | null;
    preferredBranchId: string | null;
    preferredFulfillment: string | null;
    birthday: string | null;
    lastSeenAt: Date | null;
    createdAt: Date;
  }>(
    `
      SELECT id, name, phone, segment, acquisition_source AS "acquisitionSource",
             preferred_branch_id AS "preferredBranchId", preferred_fulfillment AS "preferredFulfillment",
             birthday, last_seen_at AS "lastSeenAt", created_at AS "createdAt"
      FROM customers WHERE id = $1 AND business_id = $2
    `,
    [customerId, businessId]
  );
  const row = customer.rows[0];
  if (!row) return null;

  const windows = await pool.query<{
    scope: "last30" | "previous30";
    orderCount: string;
    totalSpendMinor: string;
    avgBasketMinor: string;
  }>(
    `
      SELECT
        CASE WHEN created_at >= now() - interval '30 days' THEN 'last30' ELSE 'previous30' END AS scope,
        count(*)::text AS "orderCount",
        coalesce(sum(total_minor), 0)::text AS "totalSpendMinor",
        coalesce(avg(total_minor), 0)::text AS "avgBasketMinor"
      FROM orders
      WHERE business_id = $1 AND customer_id = $2 AND status NOT IN ('CANCELLED', 'REJECTED')
        AND created_at >= now() - interval '60 days'
      GROUP BY scope
    `,
    [businessId, customerId]
  );
  const last30 = windows.rows.find((entry) => entry.scope === "last30");
  const previous30 = windows.rows.find((entry) => entry.scope === "previous30");

  const lifetime = await pool.query<{ orderCount: string; totalSpendMinor: string; avgBasketMinor: string }>(
    `
      SELECT count(*)::text AS "orderCount", coalesce(sum(total_minor), 0)::text AS "totalSpendMinor",
             coalesce(avg(total_minor), 0)::text AS "avgBasketMinor"
      FROM orders WHERE business_id = $1 AND customer_id = $2 AND status NOT IN ('CANCELLED', 'REJECTED')
    `,
    [businessId, customerId]
  );
  const lifetimeRow = lifetime.rows[0];

  const lastOrder = await pool.query<{ placedAt: Date; totalMinor: number; branchName: string }>(
    `
      SELECT o.placed_at AS "placedAt", o.total_minor AS "totalMinor", b.name AS "branchName"
      FROM orders o
      JOIN branches b ON b.id = o.branch_id
      WHERE o.business_id = $1 AND o.customer_id = $2
      ORDER BY o.created_at DESC
      LIMIT 1
    `,
    [businessId, customerId]
  );

  return {
    ...row,
    metrics: {
      totalSpendMinor: Number(lifetimeRow?.totalSpendMinor ?? 0),
      totalSpendTrendPct: trendPct(Number(last30?.totalSpendMinor ?? 0), Number(previous30?.totalSpendMinor ?? 0)),
      orderCount: Number(lifetimeRow?.orderCount ?? 0),
      orderCountTrendPct: trendPct(Number(last30?.orderCount ?? 0), Number(previous30?.orderCount ?? 0)),
      avgBasketMinor: Math.round(Number(lifetimeRow?.avgBasketMinor ?? 0)),
      avgBasketTrendPct: trendPct(Number(last30?.avgBasketMinor ?? 0), Number(previous30?.avgBasketMinor ?? 0)),
      lastOrder: lastOrder.rows[0] ?? null
    }
  };
}

function trendPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function updateCustomer(
  pool: Pool,
  businessId: string,
  customerId: string,
  input: UpdateCustomerRequest,
  actor: Actor
): Promise<CustomerDetail> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    await assertCustomerExists(client, businessId, customerId);
    const before = await client.query(
      `SELECT segment, acquisition_source, preferred_branch_id, preferred_fulfillment, birthday, name FROM customers WHERE id = $1 FOR UPDATE`,
      [customerId]
    );
    await client.query(
      `
        UPDATE customers SET
          name = COALESCE($3, name),
          segment = COALESCE($4, segment),
          acquisition_source = COALESCE($5, acquisition_source),
          preferred_branch_id = COALESCE($6, preferred_branch_id),
          preferred_fulfillment = COALESCE($7, preferred_fulfillment),
          birthday = COALESCE($8, birthday),
          updated_at = now()
        WHERE id = $1 AND business_id = $2
      `,
      [
        customerId,
        businessId,
        input.name ?? null,
        input.segment ?? null,
        input.acquisitionSource ?? null,
        input.preferredBranchId ?? null,
        input.preferredFulfillment ?? null,
        input.birthday ?? null
      ]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.customer.update",
      entityType: "customer",
      entityId: customerId,
      before: before.rows[0],
      after: input,
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
  const updated = await getCustomerDetail(pool, businessId, customerId);
  if (!updated) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
  return updated;
}

export interface FavoriteProduct {
  productId: string;
  productName: string;
  orderCount: number;
}

export async function getFavoriteProducts(pool: Pool, businessId: string, customerId: string, limit: number): Promise<FavoriteProduct[]> {
  const result = await pool.query<FavoriteProduct>(
    `
      SELECT oi.product_name_snapshot AS "productName", oi.product_id AS "productId", count(DISTINCT oi.order_id)::int AS "orderCount"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = $1 AND o.customer_id = $2 AND o.status NOT IN ('CANCELLED', 'REJECTED')
      GROUP BY oi.product_id, oi.product_name_snapshot
      ORDER BY count(DISTINCT oi.order_id) DESC
      LIMIT $3
    `,
    [businessId, customerId, limit]
  );
  return result.rows;
}

export interface TimelineEntry {
  kind: "order" | "loyalty" | "note";
  createdAt: Date;
  detail: string;
  refId: string | null;
  amount: number | null;
}

export async function getCustomerTimeline(pool: Pool, businessId: string, customerId: string, limit: number): Promise<TimelineEntry[]> {
  const result = await pool.query<TimelineEntry>(
    `
      (
        SELECT 'order'::text AS kind, oe.created_at AS "createdAt", oe.to_status AS detail, oe.order_id::text AS "refId", NULL::int AS amount
        FROM order_events oe
        JOIN orders o ON o.id = oe.order_id
        WHERE o.business_id = $1 AND o.customer_id = $2
      )
      UNION ALL
      (
        SELECT 'loyalty'::text, lt.created_at, lt.transaction_type, lt.order_id::text, lt.amount
        FROM loyalty_transactions lt
        WHERE lt.business_id = $1 AND lt.customer_id = $2
      )
      UNION ALL
      (
        SELECT 'note'::text, cn.created_at, cn.body, cn.id::text, NULL::int
        FROM customer_notes cn
        WHERE cn.business_id = $1 AND cn.customer_id = $2
      )
      ORDER BY "createdAt" DESC
      LIMIT $3
    `,
    [businessId, customerId, limit]
  );
  return result.rows;
}

export interface CustomerNote {
  id: string;
  body: string;
  createdAt: Date;
}

export async function listCustomerNotes(pool: Pool, businessId: string, customerId: string): Promise<CustomerNote[]> {
  const result = await pool.query<CustomerNote>(
    `SELECT id, body, created_at AS "createdAt" FROM customer_notes WHERE business_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
    [businessId, customerId]
  );
  return result.rows;
}

export async function addCustomerNote(
  pool: Pool,
  businessId: string,
  customerId: string,
  input: CustomerNoteRequest,
  actor: Actor
): Promise<CustomerNote> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    await assertCustomerExists(client, businessId, customerId);
    const result = await client.query<CustomerNote>(
      `INSERT INTO customer_notes (business_id, customer_id, author_user_id, body) VALUES ($1, $2, $3, $4) RETURNING id, body, created_at AS "createdAt"`,
      [businessId, customerId, actor.userId, input.body]
    );
    const note = result.rows[0];
    if (!note) throw new Error("Failed to add customer note.");
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.customer.note.add",
      entityType: "customer_note",
      entityId: note.id,
      after: note,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return note;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface CustomerTag {
  id: string;
  label: string;
}

export async function listCustomerTags(pool: Pool, businessId: string, customerId: string): Promise<CustomerTag[]> {
  const result = await pool.query<CustomerTag>(
    `SELECT id, label FROM customer_tags WHERE business_id = $1 AND customer_id = $2 ORDER BY created_at`,
    [businessId, customerId]
  );
  return result.rows;
}

export async function addCustomerTag(
  pool: Pool,
  businessId: string,
  customerId: string,
  input: CustomerTagRequest,
  actor: Actor
): Promise<CustomerTag> {
  await assertCustomerExists(pool, businessId, customerId);
  const result = await pool.query<CustomerTag>(
    `INSERT INTO customer_tags (business_id, customer_id, label, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, label) DO UPDATE SET label = EXCLUDED.label
     RETURNING id, label`,
    [businessId, customerId, input.label, actor.userId]
  );
  const tag = result.rows[0];
  if (!tag) throw new Error("Failed to add customer tag.");
  return tag;
}

export async function removeCustomerTag(pool: Pool, businessId: string, customerId: string, tagId: string): Promise<void> {
  const result = await pool.query(
    `DELETE FROM customer_tags WHERE id = $1 AND business_id = $2 AND customer_id = $3`,
    [tagId, businessId, customerId]
  );
  if (result.rowCount === 0) throw new ApiError(404, "NOT_FOUND", "Customer tag not found.");
}
