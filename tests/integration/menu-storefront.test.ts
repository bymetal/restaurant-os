import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/api/src/app.js";
import { runMigrations, createDatabasePool } from "@restaurant-os/db";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("menu and public storefront", () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  let businessId: string;
  let productId: string;
  let modifierId: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl as string);
    await runMigrations(pool);
    await pool.query(
      "TRUNCATE cart_item_modifiers, cart_items, carts, product_branch_availability, modifiers, modifier_groups, product_variants, products, categories, audit_logs, outbox_events, idempotency_keys, refresh_tokens, business_users, user_credentials, branches, businesses, platform_users RESTART IDENTITY CASCADE"
    );
    const business = await pool.query<{ id: string }>(
      `INSERT INTO businesses (name, slug) VALUES ('Menu Tenant', 'menu-tenant') RETURNING id`
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
    await pool.query(
      `INSERT INTO products (business_id, category_id, name, base_price, active) VALUES ($1, $2, 'Hidden Pizza', 100, false)`,
      [businessId, category.rows[0].id]
    );
    const variant = await pool.query<{ id: string }>(
      `INSERT INTO product_variants (business_id, product_id, name, price_adjustment) VALUES ($1, $2, 'Large', 40) RETURNING id`,
      [businessId, productId]
    );
    const group = await pool.query<{ id: string }>(
      `INSERT INTO modifier_groups (business_id, product_id, name, required, min_selections, max_selections) VALUES ($1, $2, 'Dough', true, 1, 1) RETURNING id`,
      [businessId, productId]
    );
    const modifier = await pool.query<{ id: string }>(
      `INSERT INTO modifiers (business_id, modifier_group_id, name, price_adjustment) VALUES ($1, $2, 'Thin', 0)`,
      [businessId, group.rows[0].id]
    );
    modifierId = modifier.rows[0].id;
    await pool.query(
      `INSERT INTO product_branch_availability (business_id, branch_id, product_id, available) VALUES ($1, $2, $3, true)`,
      [businessId, branch.rows[0].id, productId]
    );
    await pool.query(`UPDATE product_variants SET active = true WHERE id = $1`, [variant.rows[0].id]);

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
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("serves only active products for a public branch menu", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/restaurants/menu-tenant/menu?branchSlug=main-branch"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().menu.categories[0].products).toHaveLength(1);
    expect(response.json().menu.categories[0].products[0]).toMatchObject({
      name: "Margherita",
      basePrice: 280
    });
  });

  it("creates a session cart and ignores client prices", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/menu-tenant/carts",
      payload: { branchSlug: "main-branch" }
    });
    expect(created.statusCode).toBe(201);
    const setCookie = created.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const sessionCookie = cookieHeader?.split(";")[0];
    expect(sessionCookie).toBeTruthy();

    const payload = {
      productId,
      modifierIds: [modifierId],
      quantity: 2,
      clientUnitPrice: 1
    };
    const firstAdd = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/menu-tenant/carts/me/items",
      headers: { cookie: sessionCookie as string, "idempotency-key": "menu-cart-item-1" },
      payload
    });
    expect(firstAdd.statusCode).toBe(200);
    expect(firstAdd.json()).toMatchObject({ totalMinor: 560 });
    expect(firstAdd.json().items).toHaveLength(1);

    const replay = await app.inject({
      method: "POST",
      url: "/v1/public/restaurants/menu-tenant/carts/me/items",
      headers: { cookie: sessionCookie as string, "idempotency-key": "menu-cart-item-1" },
      payload
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ totalMinor: 560 });
    expect(replay.json().items).toHaveLength(1);
  });
});
