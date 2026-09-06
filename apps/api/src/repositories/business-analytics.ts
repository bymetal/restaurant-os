import type { Pool } from "pg";

export interface AnalyticsRange {
  branchId?: string | undefined;
  from: string;
  to: string;
}

export interface OverviewMetrics {
  revenueMinor: number;
  orderCount: number;
  avgBasketMinor: number;
  customerCount: number;
}

export async function getOverview(pool: Pool, businessId: string, range: AnalyticsRange): Promise<OverviewMetrics> {
  const result = await pool.query<{ revenueMinor: string; orderCount: string; avgBasketMinor: string; customerCount: string }>(
    `
      SELECT coalesce(sum(total_minor), 0)::text AS "revenueMinor",
             count(*)::text AS "orderCount",
             coalesce(avg(total_minor), 0)::text AS "avgBasketMinor",
             count(DISTINCT customer_id)::text AS "customerCount"
      FROM orders
      WHERE business_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
        AND created_at BETWEEN $3 AND $4
        AND status NOT IN ('CANCELLED', 'REJECTED')
    `,
    [businessId, range.branchId ?? null, range.from, range.to]
  );
  const row = result.rows[0];
  return {
    revenueMinor: Number(row?.revenueMinor ?? 0),
    orderCount: Number(row?.orderCount ?? 0),
    avgBasketMinor: Math.round(Number(row?.avgBasketMinor ?? 0)),
    customerCount: Number(row?.customerCount ?? 0)
  };
}

export interface RevenuePoint {
  date: string;
  revenueMinor: number;
  orderCount: number;
}

export async function getRevenueSeries(pool: Pool, businessId: string, range: AnalyticsRange): Promise<RevenuePoint[]> {
  const result = await pool.query<{ date: string; revenueMinor: string; orderCount: string }>(
    `
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
             coalesce(sum(total_minor), 0)::text AS "revenueMinor",
             count(*)::text AS "orderCount"
      FROM orders
      WHERE business_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
        AND created_at BETWEEN $3 AND $4
        AND status NOT IN ('CANCELLED', 'REJECTED')
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at)
    `,
    [businessId, range.branchId ?? null, range.from, range.to]
  );
  return result.rows.map((row) => ({
    date: row.date,
    revenueMinor: Number(row.revenueMinor),
    orderCount: Number(row.orderCount)
  }));
}

export interface CustomerMix {
  newCount: number;
  returningCount: number;
}

export async function getCustomerMix(pool: Pool, businessId: string, range: AnalyticsRange): Promise<CustomerMix> {
  const result = await pool.query<{ newCount: string; returningCount: string }>(
    `
      WITH first_orders AS (
        SELECT customer_id, min(created_at) AS first_order_at
        FROM orders
        WHERE business_id = $1 AND customer_id IS NOT NULL AND status NOT IN ('CANCELLED', 'REJECTED')
        GROUP BY customer_id
      ),
      range_customers AS (
        SELECT DISTINCT customer_id
        FROM orders
        WHERE business_id = $1
          AND ($2::uuid IS NULL OR branch_id = $2)
          AND created_at BETWEEN $3 AND $4
          AND status NOT IN ('CANCELLED', 'REJECTED')
          AND customer_id IS NOT NULL
      )
      SELECT
        count(*) FILTER (WHERE fo.first_order_at BETWEEN $3 AND $4)::text AS "newCount",
        count(*) FILTER (WHERE fo.first_order_at < $3)::text AS "returningCount"
      FROM range_customers rc
      JOIN first_orders fo ON fo.customer_id = rc.customer_id
    `,
    [businessId, range.branchId ?? null, range.from, range.to]
  );
  const row = result.rows[0];
  return { newCount: Number(row?.newCount ?? 0), returningCount: Number(row?.returningCount ?? 0) };
}

export async function getRepeatRate(pool: Pool, businessId: string, range: AnalyticsRange): Promise<{ repeatRatePct: number }> {
  const mix = await getCustomerMix(pool, businessId, range);
  const total = mix.newCount + mix.returningCount;
  return { repeatRatePct: total > 0 ? Math.round((mix.returningCount / total) * 100) : 0 };
}

export interface TopProduct {
  productId: string;
  productName: string;
  quantity: number;
}

export async function getTopProducts(pool: Pool, businessId: string, range: AnalyticsRange, limit = 5): Promise<TopProduct[]> {
  const result = await pool.query<{ productId: string; productName: string; quantity: string }>(
    `
      SELECT oi.product_id AS "productId", oi.product_name_snapshot AS "productName", sum(oi.quantity)::text AS quantity
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = $1
        AND ($2::uuid IS NULL OR o.branch_id = $2)
        AND o.created_at BETWEEN $3 AND $4
        AND o.status NOT IN ('CANCELLED', 'REJECTED')
      GROUP BY oi.product_id, oi.product_name_snapshot
      ORDER BY sum(oi.quantity) DESC
      LIMIT $5
    `,
    [businessId, range.branchId ?? null, range.from, range.to, limit]
  );
  return result.rows.map((row) => ({ productId: row.productId, productName: row.productName, quantity: Number(row.quantity) }));
}

export interface PeakHour {
  hour: number;
  orderCount: number;
}

export async function getPeakHours(pool: Pool, businessId: string, range: AnalyticsRange): Promise<PeakHour[]> {
  const result = await pool.query<{ hour: string; orderCount: string }>(
    `
      SELECT extract(hour FROM created_at)::int::text AS hour, count(*)::text AS "orderCount"
      FROM orders
      WHERE business_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
        AND created_at BETWEEN $3 AND $4
        AND status NOT IN ('CANCELLED', 'REJECTED')
      GROUP BY extract(hour FROM created_at)
      ORDER BY hour
    `,
    [businessId, range.branchId ?? null, range.from, range.to]
  );
  return result.rows.map((row) => ({ hour: Number(row.hour), orderCount: Number(row.orderCount) }));
}

export interface LoyaltySummary {
  activeMembers: number;
  trendPct: number;
  closeToRewardCount: number;
}

export async function getLoyaltySummary(pool: Pool, businessId: string): Promise<LoyaltySummary> {
  const program = await pool.query<{ id: string; goalCount: number }>(
    `SELECT id, goal_count AS "goalCount" FROM loyalty_programs WHERE business_id = $1 AND active = true LIMIT 1`,
    [businessId]
  );
  const activeProgram = program.rows[0];
  if (!activeProgram) return { activeMembers: 0, trendPct: 0, closeToRewardCount: 0 };

  const counts = await pool.query<{ scope: "last30" | "previous30"; count: string }>(
    `
      SELECT CASE WHEN created_at >= now() - interval '30 days' THEN 'last30' ELSE 'previous30' END AS scope, count(*)::text AS count
      FROM loyalty_accounts
      WHERE business_id = $1 AND program_id = $2 AND created_at >= now() - interval '60 days'
      GROUP BY scope
    `,
    [businessId, activeProgram.id]
  );
  const totalMembers = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM loyalty_accounts WHERE business_id = $1 AND program_id = $2`,
    [businessId, activeProgram.id]
  );
  const closeToReward = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM loyalty_accounts WHERE business_id = $1 AND program_id = $2 AND balance = $3`,
    [businessId, activeProgram.id, activeProgram.goalCount - 1]
  );
  const last30 = Number(counts.rows.find((row) => row.scope === "last30")?.count ?? 0);
  const previous30 = Number(counts.rows.find((row) => row.scope === "previous30")?.count ?? 0);
  const trendPct = previous30 > 0 ? Math.round(((last30 - previous30) / previous30) * 100) : last30 > 0 ? 100 : 0;

  return {
    activeMembers: Number(totalMembers.rows[0]?.count ?? 0),
    trendPct,
    closeToRewardCount: Number(closeToReward.rows[0]?.count ?? 0)
  };
}

export interface LiveOrderCounts {
  newCount: number;
  preparingCount: number;
  readyCount: number;
  outForDeliveryCount: number;
}

export async function getLiveOrderCounts(pool: Pool, businessId: string, branchId?: string): Promise<LiveOrderCounts> {
  const result = await pool.query<{ status: string; count: string }>(
    `
      SELECT status, count(*)::text AS count
      FROM orders
      WHERE business_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
        AND status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
      GROUP BY status
    `,
    [businessId, branchId ?? null]
  );
  const byStatus = new Map(result.rows.map((row) => [row.status, Number(row.count)]));
  return {
    newCount: byStatus.get("PLACED") ?? 0,
    preparingCount: (byStatus.get("ACCEPTED") ?? 0) + (byStatus.get("PREPARING") ?? 0),
    readyCount: byStatus.get("READY") ?? 0,
    outForDeliveryCount: byStatus.get("OUT_FOR_DELIVERY") ?? 0
  };
}

export async function getInsights(pool: Pool, businessId: string, range: AnalyticsRange): Promise<string[]> {
  const [overview, previousOverview, peakHours, topProducts, loyaltySummary] = await Promise.all([
    getOverview(pool, businessId, range),
    getOverview(pool, businessId, previousRange(range)),
    getPeakHours(pool, businessId, range),
    getTopProducts(pool, businessId, range, 1),
    getLoyaltySummary(pool, businessId)
  ]);

  const insights: string[] = [];
  if (previousOverview.orderCount > 0) {
    const changePct = Math.round(((overview.orderCount - previousOverview.orderCount) / previousOverview.orderCount) * 100);
    if (changePct > 0) insights.push(`Siparişlerde artış var: bu dönem siparişler %${changePct} arttı.`);
    else if (changePct < 0) insights.push(`Siparişlerde düşüş var: bu dönem siparişler %${Math.abs(changePct)} azaldı.`);
  }
  const busiestHour = [...peakHours].sort((a, b) => b.orderCount - a.orderCount)[0];
  if (busiestHour && busiestHour.orderCount > 0) {
    insights.push(
      `En yoğun saat ${busiestHour.hour}:00 – ${busiestHour.hour + 1}:00 arası, bu saatte ${busiestHour.orderCount} sipariş alındı.`
    );
  }
  if (topProducts[0]) {
    insights.push(`En çok satan ürün: ${topProducts[0].productName} (${topProducts[0].quantity} adet).`);
  }
  if (loyaltySummary.closeToRewardCount > 0) {
    insights.push(`${loyaltySummary.closeToRewardCount} müşteri ödüle çok yakın.`);
  }
  return insights;
}

function previousRange(range: AnalyticsRange): AnalyticsRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const durationMs = to.getTime() - from.getTime();
  return {
    branchId: range.branchId,
    from: new Date(from.getTime() - durationMs).toISOString(),
    to: from.toISOString()
  };
}
