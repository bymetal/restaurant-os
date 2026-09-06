import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("platform analytics", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let superAdminToken: string;
  let businessOwnerToken: string;
  let businessId: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE system_issues, integration_health, business_subscriptions, order_item_modifiers, order_items, order_payments, order_events, order_adjustments, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, platform_user_roles, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);
    const superAdminRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND scope = 'platform'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Platform Tenant', 'platform-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@platform.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const superAdmin = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('admin@platform.test', 'Super Admin') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [superAdmin.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO platform_user_roles (user_id, role_id) VALUES ($1, $2)`, [
      superAdmin.rows[0]?.id,
      superAdminRole.rows[0]?.id
    ]);

    const redis = { status: "ready", incr: async () => 1, expire: async () => 1 } as unknown as Redis;
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

    const ownerLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@platform.test", password: "owner-password-123", businessId }
    });
    businessOwnerToken = ownerLogin.json().accessToken;
    const adminLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "admin@platform.test", password: "owner-password-123" }
    });
    superAdminToken = adminLogin.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("rejects business-scope tokens from platform analytics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/analytics/overview",
      headers: { authorization: `Bearer ${businessOwnerToken}` }
    });
    expect(response.statusCode).toBe(403);
  });

  it("reports zero system issues and no fabricated WhatsApp connections before any integration reports in", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/platform/analytics/overview",
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().overview).toMatchObject({ openIssues: 0, connectedWhatsapp: 0, mrrMinor: 0 });

    const issues = await app.inject({
      method: "GET",
      url: "/v1/platform/analytics/system-issues",
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    expect(issues.json().issues).toEqual([]);
  });

  it("assigns a subscription plan and records an audit entry", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/platform/businesses/${businessId}/subscription`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { planCode: "growth" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ planCode: "growth", status: "active" });

    const audit = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE action = 'platform.subscription.assign' AND business_id = $1`,
      [businessId]
    );
    expect(audit.rows[0]?.count).toBe("1");

    const overview = await app.inject({
      method: "GET",
      url: "/v1/platform/analytics/overview",
      headers: { authorization: `Bearer ${superAdminToken}` }
    });
    expect(overview.json().overview.mrrMinor).toBe(299000);
  });
});
