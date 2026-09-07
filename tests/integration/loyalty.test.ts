import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("loyalty", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE loyalty_transactions, loyalty_accounts, loyalty_programs, order_item_modifiers, order_items, order_payments, order_events, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Loyalty Tenant', 'loyalty-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0].id;
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`,
      [businessId]
    );
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 5000) RETURNING id`,
      [businessId, category.rows[0]?.id]
    );
    productId = product.rows[0]?.id ?? "";
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@loyalty.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Tenant', 'other-tenant') RETURNING id`
    );
    const otherOwner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@other.test', 'Other Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [otherOwner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      otherBusiness.rows[0]?.id,
      otherOwner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const customer = await pool.query<{ id: string }>(
      `INSERT INTO customers (business_id, phone, name) VALUES ($1, '5551234567', 'Test Customer') RETURNING id`,
      [businessId]
    );
    customerId = customer.rows[0]?.id ?? "";

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
      payload: { email: "owner@loyalty.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@other.test", password: "owner-password-123", businessId: otherBusiness.rows[0]?.id }
    });
    otherOwnerToken = otherLogin.json().accessToken;

    const program = await app.inject({
      method: "PUT",
      url: "/v1/loyalty/program",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Pizza Club",
        rewardDescription: "1 orta boy pizza hediye",
        goalCount: 10,
        earnPerOrder: 1,
        minOrderAmountMinor: 0
      }
    });
    expect(program.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("rejects cross-tenant loyalty access", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}/loyalty`,
      headers: { authorization: `Bearer ${otherOwnerToken}` }
    });
    expect(response.statusCode).toBe(404);
  });

  it("applies a manual adjustment exactly once for a repeated idempotency key", async () => {
    const submit = () =>
      app.inject({
        method: "POST",
        url: `/v1/customers/${customerId}/loyalty/adjust`,
        headers: { authorization: `Bearer ${ownerToken}`, "idempotency-key": "adjust-race-1" },
        payload: { amount: 3, direction: "ADD", reason: "Test adjustment" }
      });
    const [first, second] = await Promise.all([submit(), submit()]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().loyalty.account.balance).toBe(3);
    expect(second.json().loyalty.account.balance).toBe(3);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM loyalty_transactions WHERE customer_id = $1`,
      [customerId]
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("rejects redemption below the reward goal", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerId}/loyalty/redeem`,
      headers: { authorization: `Bearer ${ownerToken}`, "idempotency-key": "redeem-1" },
      payload: {}
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "LOYALTY_REWARD_NOT_AVAILABLE" } });
  });

  it("earns a stamp automatically when an order is marked delivered", async () => {
    const cartCreate = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/loyalty-tenant/carts",
      payload: { branchSlug: "main-branch" }
    });
    const setCookie = cartCreate.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";

    await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/loyalty-tenant/carts/me/items",
      headers: { cookie, "idempotency-key": "loyalty-cart-item-1" },
      payload: { productId, quantity: 1 }
    });

    const checkout = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/loyalty-tenant/checkout",
      headers: { cookie, "idempotency-key": "loyalty-order-1" },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Stamp Customer", phone: "+90 555 000 00 00" },
        payment: { method: "cash" }
      }
    });
    expect(checkout.statusCode).toBe(201);
    const orderId = checkout.json().order.id as string;
    const orderCustomerId = checkout.json().order.customer.id as string;

    for (const toStatus of ["ACCEPTED", "PREPARING", "READY", "DELIVERED"]) {
      const transition = await app.inject({
        method: "POST",
        url: `/v1/orders/${orderId}/transition`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { toStatus }
      });
      expect(transition.statusCode).toBe(200);
    }

    const loyalty = await app.inject({
      method: "GET",
      url: `/v1/customers/${orderCustomerId}/loyalty`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(loyalty.statusCode).toBe(200);
    expect(loyalty.json().loyalty.account.balance).toBe(1);

    const publicStatus = await app.inject({
      method: "GET",
      url: "/v1/public/restaurants/loyalty-tenant/loyalty/me",
      headers: { cookie }
    });
    expect(publicStatus.statusCode).toBe(200);
    expect(publicStatus.json().loyalty.account.balance).toBe(1);
  });
});
