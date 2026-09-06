import type { Pool } from "pg";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { hashPassword } from "@restaurant-os/auth";
import { runMigrations } from "@restaurant-os/db";
import { buildApp } from "../../apps/api/src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("tenant isolation", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessA: string;
  let businessB: string;

  beforeAll(async () => {
    const { createDatabasePool } = await import("@restaurant-os/db");
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query("TRUNCATE audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE");

    const passwordHash = await hashPassword("owner-password-123");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const firstBusiness = await client.query<{ id: string }>(
        `INSERT INTO businesses (name, slug) VALUES ('Tenant A', 'tenant-a') RETURNING id`
      );
      const secondBusiness = await client.query<{ id: string }>(
        `INSERT INTO businesses (name, slug) VALUES ('Tenant B', 'tenant-b') RETURNING id`
      );
      businessA = firstBusiness.rows[0].id;
      businessB = secondBusiness.rows[0].id;
      const ownerRole = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`
      );
      const users = await Promise.all([
        client.query<{ id: string }>(
          `INSERT INTO platform_users (email, display_name) VALUES ('owner-a@example.test', 'Owner A') RETURNING id`
        ),
        client.query<{ id: string }>(
          `INSERT INTO platform_users (email, display_name) VALUES ('owner-b@example.test', 'Owner B') RETURNING id`
        )
      ]);
      for (const [index, userResult] of users.entries()) {
        const businessId = index === 0 ? businessA : businessB;
        const userId = userResult.rows[0].id;
        await client.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [userId, passwordHash]);
        await client.query(`INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`, [businessId, userId, ownerRole.rows[0].id]);
        await client.query(`INSERT INTO branches (business_id, name, slug) VALUES ($1, $2, $3)`, [businessId, `Branch ${index + 1}`, `branch-${index + 1}`]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool,
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
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("does not expose another tenant's users", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner-a@example.test", password: "owner-password-123", businessId: businessA }
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().accessToken as string;

    const response = await app.inject({
      method: "GET",
      url: `/v1/businesses/${businessB}/users`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("derives branch reads from the authenticated business", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "owner-a@example.test", password: "owner-password-123", businessId: businessA }
    });
    const accessToken = login.json().accessToken as string;
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().branches).toHaveLength(1);
    expect(response.json().branches[0].businessId).toBe(businessA);
  });
});
