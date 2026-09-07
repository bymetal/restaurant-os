import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("campaigns", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let productId: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE campaign_events, campaigns, order_item_modifiers, order_items, order_payments, order_events, order_adjustments, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Campaign Tenant', 'campaign-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const category = await pool.query<{ id: string }>(`INSERT INTO categories (business_id, name) VALUES ($1, 'Pizza') RETURNING id`, [
      businessId
    ]);
    const product = await pool.query<{ id: string }>(
      `INSERT INTO products (business_id, category_id, name, base_price) VALUES ($1, $2, 'Margherita', 10000) RETURNING id`,
      [businessId, category.rows[0]?.id]
    );
    productId = product.rows[0]?.id ?? "";
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@campaign.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Campaign Tenant', 'other-campaign-tenant') RETURNING id`
    );
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [
      otherBusiness.rows[0]?.id
    ]);
    const otherOwner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@othercampaign.test', 'Other Owner') RETURNING id`
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
      payload: { email: "owner@campaign.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@othercampaign.test", password: "owner-password-123", businessId: otherBusiness.rows[0]?.id }
    });
    otherOwnerToken = otherLogin.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function checkoutWithCoupon(couponCode: string | undefined) {
    const cartCreate = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/campaign-tenant/carts",
      payload: { branchSlug: "main-branch" }
    });
    const setCookie = cartCreate.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
    const key = `campaign-item-${Math.random().toString(36).slice(2)}`;
    await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/campaign-tenant/carts/me/items",
      headers: { cookie, "idempotency-key": key },
      payload: { productId, quantity: 1 }
    });
    return app.inject({
      method: "POST",
      url: "/v1/public/restaurants/campaign-tenant/checkout",
      headers: { cookie, "idempotency-key": `campaign-order-${Math.random().toString(36).slice(2)}` },
      payload: {
        fulfillment: "pickup",
        customer: { name: "Coupon Customer", phone: `+90 555 ${Math.floor(Math.random() * 9000000) + 1000000}` },
        payment: { method: "cash" },
        ...(couponCode ? { couponCode } : {})
      }
    });
  }

  it("rejects a coupon that does not exist for the current tenant", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Cross Tenant Test",
        discountType: "fixed_amount",
        discountValue: 1_000,
        couponCode: "TENANTA10",
        startsAt: new Date(Date.now() - 60_000).toISOString()
      }
    });

    const response = await checkoutWithCoupon("NOTREGISTERED");
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "CAMPAIGN_NOT_FOUND" } });
  });

  it("rejects a draft campaign's coupon code", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Draft Campaign",
        discountType: "fixed_amount",
        discountValue: 500,
        couponCode: "DRAFTCODE",
        startsAt: new Date(Date.now() - 60_000).toISOString()
      }
    });
    expect(created.json().campaign.status).toBe("draft");

    const response = await checkoutWithCoupon("DRAFTCODE");
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "CAMPAIGN_NOT_ACTIVE" } });
  });

  it("applies an active campaign discount and enforces the redemption limit under concurrency", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Limited Campaign",
        discountType: "fixed_amount",
        discountValue: 2_000,
        couponCode: "LIMIT1",
        maxRedemptions: 1,
        startsAt: new Date(Date.now() - 60_000).toISOString()
      }
    });
    const campaignId = created.json().campaign.id as string;
    const activated = await app.inject({
      method: "PUT",
      url: `/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: "active" }
    });
    expect(activated.json().campaign.status).toBe("active");

    const [first, second] = await Promise.all([checkoutWithCoupon("LIMIT1"), checkoutWithCoupon("LIMIT1")]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 400]);
    const successful = first.statusCode === 201 ? first : second;
    expect(successful.json().order.discountMinor).toBe(2_000);

    const performance = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaignId}/performance`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(performance.json().performance).toMatchObject({ redemptionCount: 1, discountMinor: 2_000 });
  });

  it("rejects cross-tenant access to a campaign by id", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: "Isolation Test",
        discountType: "percentage",
        discountValue: 10,
        couponCode: "ISOLATE10",
        startsAt: new Date(Date.now() - 60_000).toISOString()
      }
    });
    const campaignId = created.json().campaign.id as string;

    const response = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${otherOwnerToken}` }
    });
    expect(response.statusCode).toBe(404);
  });
});
