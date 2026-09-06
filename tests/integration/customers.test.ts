import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("customers", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let customerId: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE customer_tags, customer_notes, order_item_modifiers, order_items, order_payments, order_events, orders, customer_addresses, customers, delivery_zones, cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('CRM Tenant', 'crm-tenant') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@crm.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other CRM Tenant', 'other-crm-tenant') RETURNING id`
    );
    const otherOwner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@othercrm.test', 'Other Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [otherOwner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      otherBusiness.rows[0]?.id,
      otherOwner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const customer = await pool.query<{ id: string }>(
      `INSERT INTO customers (business_id, phone, name) VALUES ($1, '5559876543', 'Ahmet Yılmaz') RETURNING id`,
      [businessId]
    );
    customerId = customer.rows[0]?.id ?? "";

    app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool,
        redis: { status: "ready", incr: async () => 1, expire: async () => 1 } as never,
        publicRateLimitPerMinute: 120,
        appUrl: "http://127.0.0.1:4000",
        appEncryptionKey: "integration-app-encryption-key-integration",
        evolutionConfig: { baseUrl: "http://127.0.0.1:8080", globalApiKey: "integration-evolution-key" },
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
      payload: { email: "owner@crm.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
    const otherLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner@othercrm.test", password: "owner-password-123", businessId: otherBusiness.rows[0]?.id }
    });
    otherOwnerToken = otherLogin.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("rejects cross-tenant customer access", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}`,
      headers: { authorization: `Bearer ${otherOwnerToken}` }
    });
    expect(response.statusCode).toBe(404);
  });

  it("updates a customer profile", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/customers/${customerId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { segment: "vip", acquisitionSource: "Instagram Reklamı" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().customer).toMatchObject({ segment: "vip", acquisitionSource: "Instagram Reklamı" });
  });

  it("records an audited note and surfaces it in the timeline", async () => {
    const noteResponse = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerId}/notes`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { body: "Acılı sever, zeytin istemiyor." }
    });
    expect(noteResponse.statusCode).toBe(200);

    const audit = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE business_id = $1 AND action = 'business.customer.note.add'`,
      [businessId]
    );
    expect(audit.rows[0]?.count).toBe("1");

    const timeline = await app.inject({
      method: "GET",
      url: `/v1/customers/${customerId}/timeline`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json().timeline).toContainEqual(
      expect.objectContaining({ kind: "note", detail: "Acılı sever, zeytin istemiyor." })
    );
  });

  it("adds and removes a customer tag", async () => {
    const added = await app.inject({
      method: "POST",
      url: `/v1/customers/${customerId}/tags`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { label: "Acılı Sever" }
    });
    expect(added.statusCode).toBe(200);
    const tagId = added.json().tag.id as string;

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/customers/${customerId}/tags/${tagId}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(removed.statusCode).toBe(200);
  });
});
