import type { Pool } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface PlatformOverview {
  totalBusinesses: number;
  totalBusinessesTrendPct: number;
  activeBusinesses: number;
  todayOrders: number;
  todayOrdersTrendPct: number;
  todayGmvMinor: number;
  todayGmvTrendPct: number;
  totalCustomers: number;
  totalCustomersTrendPct: number;
  mrrMinor: number;
  connectedWhatsapp: number;
  openIssues: number;
  openIssuesTrendPct: number;
}

export async function getPlatformOverview(pool: Pool): Promise<PlatformOverview> {
  const businessCounts = await pool.query<{ total: string; active: string }>(
    `SELECT count(*)::text AS total, count(*) FILTER (WHERE active = true)::text AS active FROM businesses`
  );
  const businessTrend = await windowTrend(
    pool,
    `SELECT created_at AS "createdAt" FROM businesses WHERE created_at >= now() - interval '60 days'`,
    30
  );

  const todayOrders = await pool.query<{ amount: string }>(
    `SELECT count(*)::text AS amount FROM orders WHERE created_at >= date_trunc('day', now()) AND status NOT IN ('CANCELLED', 'REJECTED')`
  );
  const yesterdayOrders = await pool.query<{ amount: string }>(
    `
      SELECT count(*)::text AS amount FROM orders
      WHERE created_at >= date_trunc('day', now()) - interval '1 day' AND created_at < date_trunc('day', now())
        AND status NOT IN ('CANCELLED', 'REJECTED')
    `
  );
  const todayGmv = await pool.query<{ amount: string }>(
    `SELECT coalesce(sum(total_minor), 0)::text AS amount FROM orders WHERE created_at >= date_trunc('day', now()) AND status NOT IN ('CANCELLED', 'REJECTED')`
  );
  const yesterdayGmv = await pool.query<{ amount: string }>(
    `
      SELECT coalesce(sum(total_minor), 0)::text AS amount FROM orders
      WHERE created_at >= date_trunc('day', now()) - interval '1 day' AND created_at < date_trunc('day', now())
        AND status NOT IN ('CANCELLED', 'REJECTED')
    `
  );

  const customerCount = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM customers`);
  const customerTrend = await windowTrend(
    pool,
    `SELECT created_at AS "createdAt" FROM customers WHERE created_at >= now() - interval '60 days'`,
    30
  );

  const mrr = await pool.query<{ amount: string }>(
    `
      SELECT coalesce(sum(bp.monthly_price_minor), 0)::text AS amount
      FROM business_subscriptions bs
      JOIN billing_plans bp ON bp.id = bs.plan_id
      WHERE bs.status IN ('active', 'trialing')
    `
  );

  const connectedWhatsapp = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM integration_health WHERE integration_type = 'whatsapp' AND status = 'connected'`
  );

  const openIssues = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM system_issues WHERE status = 'open'`);
  const issueTrend = await windowTrend(
    pool,
    `SELECT occurred_at AS "createdAt" FROM system_issues WHERE occurred_at >= now() - interval '2 days'`,
    1
  );

  const todayGmvMinor = Number(todayGmv.rows[0]?.amount ?? 0);
  const yesterdayGmvMinor = Number(yesterdayGmv.rows[0]?.amount ?? 0);

  return {
    totalBusinesses: Number(businessCounts.rows[0]?.total ?? 0),
    totalBusinessesTrendPct: businessTrend,
    activeBusinesses: Number(businessCounts.rows[0]?.active ?? 0),
    todayOrders: Number(todayOrders.rows[0]?.amount ?? 0),
    todayOrdersTrendPct: percentChange(Number(todayOrders.rows[0]?.amount ?? 0), Number(yesterdayOrders.rows[0]?.amount ?? 0)),
    todayGmvMinor,
    todayGmvTrendPct: percentChange(todayGmvMinor, yesterdayGmvMinor),
    totalCustomers: Number(customerCount.rows[0]?.total ?? 0),
    totalCustomersTrendPct: customerTrend,
    mrrMinor: Number(mrr.rows[0]?.amount ?? 0),
    connectedWhatsapp: Number(connectedWhatsapp.rows[0]?.total ?? 0),
    openIssues: Number(openIssues.rows[0]?.total ?? 0),
    openIssuesTrendPct: issueTrend
  };
}

export interface GmvPoint {
  date: string;
  gmvMinor: number;
  orderCount: number;
  customerCount: number;
}

export async function getGmvSeries(pool: Pool, days: number): Promise<GmvPoint[]> {
  const result = await pool.query<{ date: string; gmvMinor: string; orderCount: string; customerCount: string }>(
    `
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
             coalesce(sum(total_minor), 0)::text AS "gmvMinor",
             count(*)::text AS "orderCount",
             count(DISTINCT customer_id)::text AS "customerCount"
      FROM orders
      WHERE created_at >= now() - ($1 || ' days')::interval
        AND status NOT IN ('CANCELLED', 'REJECTED')
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at)
    `,
    [days]
  );
  return result.rows.map((row) => ({
    date: row.date,
    gmvMinor: Number(row.gmvMinor),
    orderCount: Number(row.orderCount),
    customerCount: Number(row.customerCount)
  }));
}

export interface SystemIssueSummary {
  id: string;
  issueType: string;
  severity: string;
  description: string;
  businessId: string | null;
  occurredAt: Date;
}

export async function getSystemIssuesSummary(pool: Pool): Promise<SystemIssueSummary[]> {
  const result = await pool.query<SystemIssueSummary>(
    `
      SELECT id, issue_type AS "issueType", severity, description, business_id AS "businessId", occurred_at AS "occurredAt"
      FROM system_issues WHERE status = 'open' ORDER BY occurred_at DESC LIMIT 50
    `
  );
  return result.rows;
}

export async function resolveSystemIssue(pool: Pool, issueId: string, actor: Actor): Promise<void> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `UPDATE system_issues SET status = 'resolved', resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING id`,
      [issueId]
    );
    if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Open system issue not found.");
    await insertAudit(client, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "platform.system_issue.resolve",
      entityType: "system_issue",
      entityId: issueId,
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

export async function assignSubscription(
  pool: Pool,
  businessId: string,
  planCode: "starter" | "growth" | "pro",
  actor: Actor
): Promise<{ businessId: string; planCode: string; status: string }> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const plan = await client.query<{ id: string }>(`SELECT id FROM billing_plans WHERE code = $1 AND active = true`, [planCode]);
    const planId = plan.rows[0]?.id;
    if (!planId) throw new ApiError(404, "NOT_FOUND", "Billing plan not found.");
    const business = await client.query(`SELECT id FROM businesses WHERE id = $1`, [businessId]);
    if (!business.rows[0]) throw new ApiError(404, "NOT_FOUND", "Business not found.");
    await client.query(
      `
        INSERT INTO business_subscriptions (business_id, plan_id, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (business_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', updated_at = now()
      `,
      [businessId, planId]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "platform.subscription.assign",
      entityType: "business_subscription",
      entityId: businessId,
      after: { planCode },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return { businessId, planCode, status: "active" };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface AuditLogEntry {
  id: string;
  businessId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorRole: string | null;
  createdAt: Date;
}

export async function listAuditLogs(pool: Pool, limit: number): Promise<AuditLogEntry[]> {
  const result = await pool.query<AuditLogEntry>(
    `
      SELECT id, business_id AS "businessId", action, entity_type AS "entityType", entity_id AS "entityId",
             actor_role AS "actorRole", created_at AS "createdAt"
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

async function windowTrend(pool: Pool, timestampQuery: string, windowDays: number): Promise<number> {
  const result = await pool.query<{ createdAt: Date }>(timestampQuery);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let recent = 0;
  let previous = 0;
  for (const row of result.rows) {
    if (row.createdAt.getTime() >= cutoff) recent += 1;
    else previous += 1;
  }
  return percentChange(recent, previous);
}

function percentChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
