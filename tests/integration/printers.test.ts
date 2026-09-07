import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("printer devices and jobs", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let branchId: string;
  let otherBusinessId: string;
  let otherBranchId: string;
  let productId: string;
  let ownerToken: string;
  let otherOwnerToken: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE print_jobs, print_devices, order_item_modifiers, order_items, order_payments, order_events, orders, customers, cart_item_modifiers, cart_items, carts, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Printer Tenant', 'printer-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    const branch = await pool.query<{ id: string }>(
      `INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch') RETURNING id`,
      [businessId]
    );
    branchId = branch.rows[0]?.id ?? "";
    const category = await pool.query<{ id: string }>(`INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`, [
      businessId
    ]);
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 280) RETURNING id`,
      [businessId, category.rows[0]?.id]
    );
    productId = product.rows[0]?.id ?? "";

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Printer Tenant', 'other-printer-tenant') RETURNING id`
    );
    otherBusinessId = otherBusiness.rows[0]?.id ?? "";
    const otherBranch = await pool.query<{ id: string }>(
      `INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Other Branch', 'other-branch') RETURNING id`,
      [otherBusinessId]
    );
    otherBranchId = otherBranch.rows[0]?.id ?? "";

    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@printer.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const otherOwner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@other-printer.test', 'Other Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [otherOwner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      otherBusinessId,
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
      payload: { email: "owner@printer.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;

    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@other-printer.test", password: "owner-password-123", businessId: otherBusinessId }
    });
    otherOwnerToken = otherLogin.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function placeOrder(idempotencyPrefix: string): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/printer-tenant/carts",
      payload: { branchSlug: "main-branch" }
    });
    const setCookie = created.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
    await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/printer-tenant/carts/me/items",
      headers: { cookie, "idempotency-key": `${idempotencyPrefix}-item` },
      payload: { productId, quantity: 1 }
    });
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/printer-tenant/checkout",
      headers: { cookie, "idempotency-key": `${idempotencyPrefix}-checkout` },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Printer Test Customer", phone: "+90 532 444 55 66" },
        payment: { method: "cash", amountMinor: 1 }
      }
    });
    expect(checkout.statusCode).toBe(201);
    return checkout.json().order.id as string;
  }

  it("registers a print device and returns a one-time device key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/printers/devices",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { branchId, name: "Mutfak Yazıcısı", role: "KITCHEN" }
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.device).toMatchObject({ name: "Mutfak Yazıcısı", role: "KITCHEN", status: "offline" });
    expect(typeof body.deviceKey).toBe("string");
    expect(body.deviceKey.length).toBeGreaterThan(10);
  });

  it("rejects device-authenticated routes without a valid bearer key", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/printers/jobs/pending" });
    expect(response.statusCode).toBe(401);

    const wrongKey = await app.inject({
      method: "GET",
      url: "/v1/printers/jobs/pending",
      headers: { authorization: "Bearer not-a-real-key" }
    });
    expect(wrongKey.statusCode).toBe(401);
  });

  it("creates a KITCHEN_RECEIPT print job when an order is accepted, and lets the registered device claim, then ack it", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/v1/printers/devices",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { branchId, name: "Kasa Yazıcısı", role: "KITCHEN" }
    });
    const deviceKey = register.json().deviceKey as string;

    const orderId = await placeOrder("printer-order-1");
    const transition = await app.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/transition`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { toStatus: "ACCEPTED" }
    });
    expect(transition.statusCode).toBe(200);

    const heartbeat = await app.inject({
      method: "POST",
      url: "/v1/printers/heartbeat",
      headers: { authorization: `Bearer ${deviceKey}` }
    });
    expect(heartbeat.statusCode).toBe(200);

    const pending = await app.inject({
      method: "GET",
      url: "/v1/printers/jobs/pending",
      headers: { authorization: `Bearer ${deviceKey}` }
    });
    expect(pending.statusCode).toBe(200);
    const jobs = pending.json().jobs as Array<{ id: string; orderId: string; type: string }>;
    expect(jobs.some((job) => job.orderId === orderId && job.type === "KITCHEN_RECEIPT")).toBe(true);
    const job = jobs.find((j) => j.orderId === orderId);

    const ack = await app.inject({
      method: "POST",
      url: `/v1/printers/jobs/${job?.id}/ack`,
      headers: { authorization: `Bearer ${deviceKey}` },
      payload: { status: "PRINTED" }
    });
    expect(ack.statusCode).toBe(200);

    const jobRow = await pool.query<{ status: string }>(`SELECT status FROM print_jobs WHERE id = $1`, [job?.id]);
    expect(jobRow.rows[0]).toMatchObject({ status: "PRINTED" });
  });

  it("does not let a device from one business claim another business's print jobs", async () => {
    const orderId = await placeOrder("printer-order-cross");
    await app.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/transition`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { toStatus: "ACCEPTED" }
    });

    const registerOther = await app.inject({
      method: "POST",
      url: "/v1/printers/devices",
      headers: { authorization: `Bearer ${otherOwnerToken}` },
      payload: { branchId: otherBranchId, name: "Other Kitchen", role: "KITCHEN" }
    });
    expect(registerOther.statusCode).toBe(201);
    const otherDeviceKey = registerOther.json().deviceKey as string;

    const pending = await app.inject({
      method: "GET",
      url: "/v1/printers/jobs/pending",
      headers: { authorization: `Bearer ${otherDeviceKey}` }
    });
    expect(pending.statusCode).toBe(200);
    const jobs = pending.json().jobs as Array<{ orderId: string }>;
    expect(jobs.some((j) => j.orderId === orderId)).toBe(false);
  });

  it("only routes KITCHEN_RECEIPT jobs to KITCHEN-role devices, not CASHIER-role devices", async () => {
    const orderId = await placeOrder("printer-order-role");
    await app.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/transition`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { toStatus: "ACCEPTED" }
    });

    const registerCashier = await app.inject({
      method: "POST",
      url: "/v1/printers/devices",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { branchId, name: "Kasa Cihazı", role: "CASHIER" }
    });
    const cashierDeviceKey = registerCashier.json().deviceKey as string;

    const pending = await app.inject({
      method: "GET",
      url: "/v1/printers/jobs/pending",
      headers: { authorization: `Bearer ${cashierDeviceKey}` }
    });
    expect(pending.statusCode).toBe(200);
    const jobs = pending.json().jobs as Array<{ orderId: string }>;
    expect(jobs.some((j) => j.orderId === orderId)).toBe(false);
  });
});
