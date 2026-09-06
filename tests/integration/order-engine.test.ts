import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("order engine", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let productId: string;
  let cookie: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE order_item_modifiers, order_items, order_payments, order_events, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );
    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Order Tenant', 'order-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0].id;
    const branch = await pool.query<{ id: string }>(
      `INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch') RETURNING id`,
      [businessId]
    );
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`,
      [businessId]
    );
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 280) RETURNING id`,
      [businessId, category.rows[0].id]
    );
    productId = product.rows[0].id;

    const redis = {
      status: "ready",
      incr: async () => 1,
      expire: async () => 1
    } as unknown as Redis;
    app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool,
        redis,
        publicRateLimitPerMinute: 120,
        authConfig: {
          jwtSecret: "integration-jwt-secret-integration-jwt-secret",
          jwtIssuer: "integration-issuer",
          jwtAudience: "integration-audience",
          accessTokenTtlSeconds: 900,
          refreshTokenTtlDays: 30,
          refreshCookieName: "integration_refresh",
          refreshCookieSecure: false,
          allowedOrigins: []
        }
      },
      { logger: false }
    );

    const created = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/order-tenant/carts",
      payload: { branchSlug: "main-branch" }
    });
    expect(created.statusCode).toBe(201);
    const setCookie = created.headers["set-cookie"];
    const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    cookie = cookieValue?.split(";")[0] ?? "";
    expect(cookie).toContain("restaurant_os_storefront=");
    const added = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/order-tenant/carts/me/items",
      headers: { cookie, "idempotency-key": "order-cart-item-1" },
      payload: { productId, quantity: 2 }
    });
    expect(added.statusCode).toBe(200);
    await pool.query(`UPDATE products SET base_price = 300 WHERE id = $1`, [productId]);
    void branch;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("recomputes DB prices and closes the cart in checkout transaction", async () => {
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/order-tenant/checkout",
      headers: { cookie, "idempotency-key": "order-submit-1" },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Test Customer", phone: "+90 532 123 45 67" },
        payment: { method: "cash", amountMinor: 1 }
      }
    });

    expect(checkout.statusCode).toBe(201);
    expect(checkout.json()).toMatchObject({
      order: {
        status: "PLACED",
        subtotalMinor: 600,
        totalMinor: 600,
        payment: { status: "CAPTURED_OFFLINE", amountMinor: 600 }
      }
    });
    const rows = await pool.query<{ count: string; status: string }>(
      `SELECT count(*)::text AS count, (SELECT status FROM carts LIMIT 1) AS status FROM orders WHERE business_id = $1`,
      [businessId]
    );
    expect(rows.rows[0]).toMatchObject({ count: "1", status: "checked_out" });
  });

  it("replays the same order after its cart has been closed", async () => {
    const replay = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/order-tenant/checkout",
      headers: { cookie, "idempotency-key": "order-submit-1" },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Test Customer", phone: "+90 532 123 45 67" },
        payment: { method: "cash", amountMinor: 1 }
      }
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json().order.orderNumber).toBe(1);
    const count = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM orders WHERE business_id = $1`, [businessId]);
    expect(count.rows[0].count).toBe("1");
  });
});
