import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("business analytics", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let productId: string;
  let from: string;
  let to: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE order_item_modifiers, order_items, order_payments, order_events, order_adjustments, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Analytics Tenant', 'analytics-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const category = await pool.query<{ id: string }>(`INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`, [
      businessId
    ]);
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 5000) RETURNING id`,
      [businessId, category.rows[0]?.id]
    );
    productId = product.rows[0]?.id ?? "";
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@analytics.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Analytics Tenant', 'other-analytics-tenant') RETURNING id`
    );
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [
      otherBusiness.rows[0]?.id
    ]);
    const otherOwner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@otheranalytics.test', 'Other Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [otherOwner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      otherBusiness.rows[0]?.id,
      otherOwner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const redis = { status: "ready", incr: async () => 1, expire: async () => 1 } as unknown as Redis;
    app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool,
        redis,
        publicRateLimitPerMinute: 120,
        appUrl: "http://127.0.0.1:4000",
        appEncryptionKey: "integration-app-encryption-key-integration",
        evolutionConfig: { baseUrl: "http://127.0.0.1:8080", globalApiKey: "integration-evolution-key" },
        telegramConfig: { botToken: "integration-telegram-token" },
        telegramWebhookSecret: "integration-telegram-webhook-secret",
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

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@analytics.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@otheranalytics.test", password: "owner-password-123", businessId: otherBusiness.rows[0]?.id }
    });
    otherOwnerToken = otherLogin.json().accessToken;

    from = new Date(Date.now() - 60_000).toISOString();

    for (const phone of ["+90 555 111 1111", "+90 555 222 2222"]) {
      const cartCreate = await app.inject({
        method: "POST",
        url: "/v1/public/restaurants/analytics-tenant/carts",
        payload: { branchSlug: "main-branch" }
      });
      const setCookie = cartCreate.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
      await app.inject({
        method: "POST",
        url: "/v1/public/restaurants/analytics-tenant/carts/me/items",
        headers: { cookie, "idempotency-key": `analytics-item-${phone}` },
        payload: { productId, quantity: 1 }
      });
      const checkout = await app.inject({
        method: "POST",
        url: "/v1/public/restaurants/analytics-tenant/checkout",
        headers: { cookie, "idempotency-key": `analytics-order-${phone}` },
        payload: {
          fulfillment: "pickup",
          customer: { name: "Analytics Customer", phone },
          payment: { method: "cash" }
        }
      });
      expect(checkout.statusCode).toBe(201);
    }
    to = new Date(Date.now() + 60_000).toISOString();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("reports overview metrics consistent with the orders placed in range", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().overview).toMatchObject({ orderCount: 2, revenueMinor: 10_000, customerCount: 2 });
  });

  it("counts both orders as new customers within the same range", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/customer-mix?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().mix).toEqual({ newCount: 2, returningCount: 0 });
  });

  it("does not leak another tenant's orders into their own analytics", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/analytics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { authorization: `Bearer ${otherOwnerToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().overview).toMatchObject({ orderCount: 0, revenueMinor: 0 });
  });
});
