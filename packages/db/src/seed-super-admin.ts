import { hashPassword } from "@restaurant-os/auth";
import { loadEnv } from "@restaurant-os/config";
import { closeDatabase, createDatabasePool } from "./client.js";

const env = loadEnv();
if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
  throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required to seed the super admin.");
}

const pool = createDatabasePool(env.DATABASE_URL);
const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const userResult = await client.query<{ id: string }>(
    `
      INSERT INTO platform_users (email, display_name)
      VALUES ($1, 'Platform Admin')
      ON CONFLICT ((lower(email))) DO UPDATE SET active = true, token_version = platform_users.token_version + 1
      RETURNING id
    `,
    [email]
  );
  const user = userResult.rows[0];
  if (!user) throw new Error("Failed to create or load the super admin.");
  const userId = user.id;
  await client.query(
    `
      INSERT INTO user_credentials (user_id, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        password_changed_at = now(),
        failed_login_attempts = 0,
        locked_until = NULL
    `,
    [userId, passwordHash]
  );
  const roleResult = await client.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND scope = 'platform'`
  );
  if (!roleResult.rows[0]) throw new Error("SUPER_ADMIN role is missing; run migrations first.");
  await client.query(
    `INSERT INTO platform_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, roleResult.rows[0].id]
  );
  await client.query(
    `
      INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, after_json, metadata)
      VALUES ($1, 'SYSTEM', 'platform.super_admin.seed', 'platform_user', $1, $2::jsonb, '{}'::jsonb)
    `,
    [userId, JSON.stringify({ email })]
  );
  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({ event: "super_admin_seeded", userId, email })}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await closeDatabase(pool);
}
