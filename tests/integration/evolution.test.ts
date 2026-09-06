import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { createDatabasePool, runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("evolution webhooks", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let otherBusinessId: string;
  let connectionId: string;
  let ownerToken: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE webhook_events, acquisition_events, qr_codes, loyalty_claim_tokens, customer_consents, integration_connections, loyalty_transactions, loyalty_accounts, loyalty_programs, customers, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await hashPassword("owner-password-123");
    const ownerRole = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`);

    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, currency) VALUES ('Evolution Tenant', 'evolution-tenant', 'TRY') RETURNING id`
    );
    businessId = business.rows[0]?.id ?? "";
    await pool.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, 'Main Branch', 'main-branch')`, [businessId]);

    const otherBusiness = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Other Evolution Tenant', 'other-evolution-tenant') RETURNING id`
    );
    otherBusinessId = otherBusiness.rows[0]?.id ?? "";

    const owner = await pool.query<{ id: string }>(
      `INSERT INTO platform_users (email, display_name) VALUES ('owner@evolution.test', 'Owner') RETURNING id`
    );
    await pool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [owner.rows[0]?.id, passwordHash]);
    await pool.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [
      businessId,
      owner.rows[0]?.id,
      ownerRole.rows[0]?.id
    ]);

    const connection = await pool.query<{ id: string }>(
      `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, webhook_state)
       VALUES ($1, 'evolution', 'biz-test-instance', 'connected', 'configured') RETURNING id`,
      [businessId]
    );
    connectionId = connection.rows[0]?.id ?? "";

    await pool.query(
      `INSERT INTO loyalty_programs (business_id, name, reward_description, goal_count, earn_per_order, min_order_amount_minor, active)
       VALUES ($1, 'Stamps', 'Free item', 10, 1, 0, true)`,
      [businessId]
    );

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
      payload: { email: "owner@evolution.test", password: "owner-password-123", businessId }
    });
    ownerToken = login.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  function messageUpsertPayload(messageId: string, phone: string, text: string) {
    return {
      event: "messages.upsert",
      instance: "biz-test-instance",
      data: {
        key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
        message: { conversation: text },
        pushName: "Test Customer"
      }
    };
  }

  it("processes a JOIN message and creates a customer with transactional consent", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${connectionId}`,
      payload: messageUpsertPayload("msg-1", "905321110000", "KATIL flyer-token")
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "processed" });

    const customer = await pool.query<{ id: string }>(
      `SELECT id FROM customers WHERE business_id = $1 AND phone = '905321110000'`,
      [businessId]
    );
    expect(customer.rows).toHaveLength(1);

    const consent = await pool.query(`SELECT type, status FROM customer_consents WHERE customer_id = $1`, [customer.rows[0]?.id]);
    expect(consent.rows).toContainEqual({ type: "TRANSACTIONAL", status: "granted" });
  });

  it("deduplicates a webhook delivered twice with the same provider message id", async () => {
    const payload = messageUpsertPayload("msg-dedupe-1", "905321110001", "KATIL flyer-token");
    const first = await app.inject({ method: "POST", url: `/v1/webhooks/evolution/${connectionId}`, payload });
    const second = await app.inject({ method: "POST", url: `/v1/webhooks/evolution/${connectionId}`, payload });
    expect(first.json()).toMatchObject({ status: "processed" });
    expect(second.json()).toMatchObject({ status: "duplicate" });

    const customers = await pool.query(`SELECT id FROM customers WHERE business_id = $1 AND phone = '905321110001'`, [businessId]);
    expect(customers.rows).toHaveLength(1);
  });

  it("returns 404 for an unknown connection id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/evolution/00000000-0000-0000-0000-000000000000",
      payload: messageUpsertPayload("msg-2", "905321110002", "KATIL flyer-token")
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects reuse of an already-consumed loyalty claim token", async () => {
    const issued = await app.inject({
      method: "POST",
      url: "/v1/loyalty/claim-tokens",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {}
    });
    expect(issued.statusCode).toBe(201);
    const token = issued.json().claimToken.token as string;

    const first = await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${connectionId}`,
      payload: messageUpsertPayload("msg-claim-1", "905321110003", `SADAKAT ${token}`)
    });
    expect(first.json()).toMatchObject({ status: "processed" });

    const second = await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${connectionId}`,
      payload: messageUpsertPayload("msg-claim-2", "905321110003", `SADAKAT ${token}`)
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "LOYALTY_TOKEN_ALREADY_USED" } });
  });

  it("does not leak a customer created via one tenant's connection into another tenant", async () => {
    const otherConnection = await pool.query<{ id: string }>(
      `INSERT INTO integration_connections (business_id, provider, instance_name, connection_state, webhook_state)
       VALUES ($1, 'evolution', 'biz-other-instance', 'connected', 'configured') RETURNING id`,
      [otherBusinessId]
    );
    const otherConnectionId = otherConnection.rows[0]?.id ?? "";

    await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${otherConnectionId}`,
      payload: messageUpsertPayload("msg-cross-1", "905321110004", "KATIL flyer-token")
    });

    const leaked = await pool.query(`SELECT id FROM customers WHERE business_id = $1 AND phone = '905321110004'`, [businessId]);
    expect(leaked.rows).toHaveLength(0);
    const correct = await pool.query(`SELECT id FROM customers WHERE business_id = $1 AND phone = '905321110004'`, [otherBusinessId]);
    expect(correct.rows).toHaveLength(1);
  });

  it("records a MARKETING opt-out for a known customer without side effects for unknown numbers", async () => {
    await pool.query(`INSERT INTO customers (business_id, phone, name) VALUES ($1, '905321110005', 'Opt Out Customer')`, [businessId]);

    const known = await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${connectionId}`,
      payload: messageUpsertPayload("msg-optout-1", "905321110005", "STOP")
    });
    expect(known.statusCode).toBe(200);

    const unknown = await app.inject({
      method: "POST",
      url: `/v1/webhooks/evolution/${connectionId}`,
      payload: messageUpsertPayload("msg-optout-2", "905321119999", "IPTAL")
    });
    expect(unknown.statusCode).toBe(200);

    const customer = await pool.query<{ id: string }>(`SELECT id FROM customers WHERE business_id = $1 AND phone = '905321110005'`, [
      businessId
    ]);
    const consent = await pool.query(`SELECT status FROM customer_consents WHERE customer_id = $1 AND type = 'MARKETING'`, [
      customer.rows[0]?.id
    ]);
    expect(consent.rows).toContainEqual({ status: "withdrawn" });

    const phantom = await pool.query(`SELECT id FROM customers WHERE business_id = $1 AND phone = '905321119999'`, [businessId]);
    expect(phantom.rows).toHaveLength(0);
  });
});
