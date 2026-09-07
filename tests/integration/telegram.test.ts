import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("telegram webhooks", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let otherBusinessId: string;
  let productId: string;
  let ownerToken: string;
  const webhookSecret = "integration-telegram-webhook-secret";

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE print_jobs, print_devices, webhook_events, integration_connections, order_item_modifiers, order_items, order_payments, order_events, orders, customers, cart_item_modifiers, cart_items, carts, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Telegram Tenant', 'telegram-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const category = await pool.query<{ id: string }>(`INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`, [
      businessId
    ]);
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 280) RETURNING id`,
      [businessId, category.rows[0]?.id]
    );
    productId = product.rows[0]?.id ?? "";

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Telegram Tenant', 'other-telegram-tenant') RETURNING id`
    );
    otherBusinessId = otherBusiness.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Other Branch', 'other-branch')`, [otherBusinessId]);

    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@telegram.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
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
        telegramWebhookSecret: webhookSecret,
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
      payload: { email: "owner@telegram.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function seedConnectingLink(targetBusinessId: string, code: string): Promise<void> {
    await pool.query(
      `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, webhook_state, link_code, link_code_expires_at)
       VALUES ($1, 'telegram', 'test_bot', 'connecting', 'configured', $2, now() + interval '15 minutes')
       ON CONFLICT (business_id, provider) DO UPDATE SET connection_state = 'connecting', link_code = $2, link_code_expires_at = now() + interval '15 minutes', chat_id = NULL`,
      [targetBusinessId, code]
    );
  }

  async function placeOrder(businessSlug: string, branchSlug: string, cookieIdempotency: string): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: `/v1/public/restaurants/${businessSlug}/carts`,
      payload: { branchSlug }
    });
    const setCookie = created.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
    await app.inject({
      method: "POST",
      url: `/v1/public/restaurants/${businessSlug}/carts/me/items`,
      headers: { cookie, "idempotency-key": `${cookieIdempotency}-item` },
      payload: { productId, quantity: 1 }
    });
    const checkout = await app.inject({
      method: "POST",
      url: `/v1/public/restaurants/${businessSlug}/checkout`,
      headers: { cookie, "idempotency-key": `${cookieIdempotency}-checkout` },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Telegram Test Customer", phone: "+90 532 111 22 33" },
        payment: { method: "cash", amountMinor: 1 }
      }
    });
    expect(checkout.statusCode).toBe(201);
    return checkout.json().order.id as string;
  }

  function webhookHeaders() {
    return { "x-telegram-bot-api-secret-token": webhookSecret };
  }

  it("starts a telegram link over the authenticated connect endpoint even when the Telegram API is unreachable", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations/telegram/connect",
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ connection: { connectionState: "connecting" } });
    expect(response.json().connection.linkCode).toMatch(/^\d{6}$/);
  });

  it("rejects webhook calls with a missing or wrong secret token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/telegram",
      payload: { update_id: 1, message: { text: "/link 111111", chat: { id: 1 } } }
    });
    expect(response.statusCode).toBe(401);
  });

  it("confirms a pending link code via a /link message and marks the connection connected", async () => {
    await seedConnectingLink(businessId, "482913");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/telegram",
      headers: webhookHeaders(),
      payload: { update_id: 1001, message: { text: "/link 482913", chat: { id: 555111 } } }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "processed" });

    const connection = await pool.query(`SELECT connection_state, chat_id, link_code FROM integration_connections WHERE business_id = $1 AND provider = 'telegram'`, [
      businessId
    ]);
    expect(connection.rows[0]).toMatchObject({ connection_state: "connected", chat_id: "555111", link_code: null });
  });

  it("ignores an unknown or already-consumed link code without side effects", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/telegram",
      headers: webhookHeaders(),
      payload: { update_id: 1002, message: { text: "/link 000000", chat: { id: 999999 } } }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ignored" });
  });

  it("deduplicates a webhook update delivered twice with the same update_id", async () => {
    const payload = { update_id: 2001, message: { text: "/link nope", chat: { id: 42 } } };
    const first = await app.inject({ method: "POST", url: "/v1/webhooks/telegram", headers: webhookHeaders(), payload });
    const second = await app.inject({ method: "POST", url: "/v1/webhooks/telegram", headers: webhookHeaders(), payload });
    expect(first.json()).toMatchObject({ status: "ignored" });
    expect(second.json()).toMatchObject({ status: "duplicate" });
  });

  it("transitions an order via a callback_query button press and creates a kitchen print job on ACCEPTED", async () => {
    const orderId = await placeOrder("telegram-tenant", "main-branch", "tg-order-1");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/telegram",
      headers: webhookHeaders(),
      payload: {
        update_id: 3001,
        callback_query: { id: "cb-1", data: `ord:${orderId}:ACCEPTED`, message: { chat: { id: 555111 } } }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "processed" });

    const order = await pool.query<{ status: string }>(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    expect(order.rows[0]).toMatchObject({ status: "ACCEPTED" });

    const printJobs = await pool.query(`SELECT type, status FROM print_jobs WHERE order_id = $1`, [orderId]);
    expect(printJobs.rows).toContainEqual({ type: "KITCHEN_RECEIPT", status: "PENDING" });

    const orderEvent = await pool.query<{ actorType: string }>(
      `SELECT actor_type AS "actorType" FROM order_events WHERE order_id = $1 AND to_status = 'ACCEPTED'`,
      [orderId]
    );
    expect(orderEvent.rows[0]).toMatchObject({ actorType: "system" });
  });

  it("does not let a chat linked to one business transition another business's order", async () => {
    await pool.query(
      `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, chat_id, webhook_state) VALUES ($1, 'telegram', 'other_bot', 'connected', '777222', 'configured')`,
      [otherBusinessId]
    );
    const orderId = await placeOrder("telegram-tenant", "main-branch", "tg-order-cross");

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/telegram",
      headers: webhookHeaders(),
      payload: {
        update_id: 4001,
        callback_query: { id: "cb-2", data: `ord:${orderId}:ACCEPTED`, message: { chat: { id: 777222 } } }
      }
    });
    expect(response.statusCode).toBe(200);

    const order = await pool.query<{ status: string; businessId: string }>(
      `SELECT status, business_id AS "businessId" FROM orders WHERE id = $1`,
      [orderId]
    );
    expect(order.rows[0]).toMatchObject({ status: "PLACED", businessId });
  });
});
