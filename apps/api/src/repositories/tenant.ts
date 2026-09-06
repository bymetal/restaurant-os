import type { Pool, PoolClient } from "pg";
import type {
  CreateBranchRequest,
  CreateBusinessRequest,
  RoleAssignmentRequest
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";

export interface AuditInput {
  businessId?: string | undefined;
  branchId?: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface CreatedBusinessResponse {
  business: { id: string; name: string; slug: string; active: boolean };
  branch: { id: string; name: string };
  owner: { id: string; email: string; displayName: string };
}

export async function createBusinessWithOwner(
  pool: Pool,
  input: CreateBusinessRequest,
  passwordHash: string,
  actor: { userId: string; role: string; ipAddress?: string | undefined; userAgent?: string | undefined },
  idempotencyKey: string,
  requestHash: string
): Promise<{ replay: boolean; response: CreatedBusinessResponse }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const idempotencyInsert = await client.query<{ id: string }>(
      `
        INSERT INTO idempotency_keys (business_id, scope, key, request_hash)
        VALUES (NULL, 'platform.business.create', $1, $2)
        ON CONFLICT (scope, key) WHERE business_id IS NULL DO NOTHING
        RETURNING id
      `,
      [idempotencyKey, requestHash]
    );

    if (idempotencyInsert.rows.length === 0) {
      const existing = await client.query<{ responseBody: CreatedBusinessResponse | null }>(
        `
          SELECT response_body AS "responseBody"
          FROM idempotency_keys
          WHERE business_id IS NULL AND scope = 'platform.business.create' AND key = $1
          FOR UPDATE
        `,
        [idempotencyKey]
      );
      const body = existing.rows[0]?.responseBody;
      if (!body) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This request is already being processed.");
      await client.query("COMMIT");
      return { replay: true, response: body };
    }

    const duplicateBusiness = await client.query("SELECT 1 FROM businesses WHERE slug = $1", [input.slug]);
    if (duplicateBusiness.rowCount) {
      throw new ApiError(409, "BUSINESS_SLUG_EXISTS", "A business with this slug already exists.");
    }
    const duplicateOwner = await client.query("SELECT 1 FROM platform_users WHERE lower(email) = lower($1)", [input.ownerEmail]);
    if (duplicateOwner.rowCount) {
      throw new ApiError(409, "USER_EMAIL_EXISTS", "A user with this email already exists.");
    }

    const businessResult = await client.query<{ id: string }>(
      `
        INSERT INTO businesses (name, slug, timezone, currency)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [input.name, input.slug, input.timezone, input.currency]
    );
    const business = businessResult.rows[0];
    if (!business) throw new Error("Failed to create business.");
    const businessId = business.id;
    const branchResult = await client.query<{ id: string }>(
      `
        INSERT INTO branches (business_id, name, address_text, timezone)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [businessId, input.branchName, input.branchAddress ?? null, input.timezone]
    );
    const userResult = await client.query<{ id: string }>(
      `
        INSERT INTO platform_users (email, display_name)
        VALUES (lower($1), $2)
        RETURNING id
      `,
      [input.ownerEmail, input.ownerDisplayName]
    );
    const owner = userResult.rows[0];
    if (!owner) throw new Error("Failed to create business owner.");
    const ownerId = owner.id;
    const ownerRole = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'OWNER' AND scope = 'business'`
    );
    if (!ownerRole.rows[0]) throw new Error("OWNER role is missing; run migrations first.");

    await client.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [ownerId, passwordHash]
    );
    await client.query(
      `INSERT INTO business_users (business_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [businessId, ownerId, ownerRole.rows[0].id]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "platform.business.create",
      entityType: "business",
      entityId: businessId,
      after: { businessId, slug: input.slug, ownerId },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query(
      `
        INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload)
        VALUES ($1, 'business.created', 'business', $2, $3::jsonb)
      `,
      [businessId, businessId, JSON.stringify({ businessId, ownerId })]
    );

    const branch = branchResult.rows[0];
    if (!branch) throw new Error("Failed to create business branch.");
    const idempotencyRecord = idempotencyInsert.rows[0];
    if (!idempotencyRecord) throw new Error("Failed to create idempotency record.");
    const response: CreatedBusinessResponse = {
      business: { id: businessId, name: input.name, slug: input.slug, active: true },
      branch: { id: branch.id, name: input.branchName },
      owner: { id: ownerId, email: input.ownerEmail.toLowerCase(), displayName: input.ownerDisplayName }
    };
    await client.query(
      `
        UPDATE idempotency_keys
        SET response_status = 201, response_body = $2::jsonb
        WHERE id = $1
      `,
      [idempotencyRecord.id, JSON.stringify(response)]
    );
    await client.query("COMMIT");
    return { replay: false, response };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBusinesses(pool: Pool, search?: string): Promise<unknown[]> {
  const result = await pool.query(
    `
      SELECT
        b.id,
        b.name,
        b.slug,
        b.active,
        b.timezone,
        b.currency,
        b.created_at AS "createdAt",
        COUNT(DISTINCT br.id)::int AS "branchCount",
        COUNT(DISTINCT bu.user_id)::int AS "userCount"
      FROM businesses b
      LEFT JOIN branches br ON br.business_id = b.id
      LEFT JOIN business_users bu ON bu.business_id = b.id
      WHERE ($1::text IS NULL OR b.name ILIKE '%' || $1 || '%' OR b.slug ILIKE '%' || $1 || '%')
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `,
    [search ?? null]
  );
  return result.rows;
}

export async function getBusinessDetail(pool: Pool, businessId: string): Promise<unknown | null> {
  const business = await pool.query(
    `SELECT id, name, slug, active, timezone, currency, created_at AS "createdAt" FROM businesses WHERE id = $1`,
    [businessId]
  );
  if (!business.rows[0]) return null;
  const [branches, users] = await Promise.all([
    pool.query(
      `SELECT id, name, address_text AS "addressText", active FROM branches WHERE business_id = $1 ORDER BY created_at`,
      [businessId]
    ),
    pool.query(
      `
        SELECT pu.id, pu.email, pu.display_name AS "displayName", pu.active, r.name AS role
        FROM business_users bu
        JOIN platform_users pu ON pu.id = bu.user_id
        JOIN roles r ON r.id = bu.role_id
        WHERE bu.business_id = $1
        ORDER BY pu.created_at
      `,
      [businessId]
    )
  ]);
  return { ...business.rows[0], branches: branches.rows, users: users.rows };
}

export async function setBusinessActive(
  pool: Pool,
  businessId: string,
  active: boolean,
  actor: { userId: string; role: string; ipAddress?: string | undefined; userAgent?: string | undefined }
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ active: boolean; name: string }>(
      `SELECT active, name FROM businesses WHERE id = $1 FOR UPDATE`,
      [businessId]
    );
    const business = existing.rows[0];
    if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found.");
    await client.query(`UPDATE businesses SET active = $2, updated_at = now() WHERE id = $1`, [businessId, active]);
    await client.query(
      `
        UPDATE platform_users pu
        SET token_version = pu.token_version + 1
        FROM business_users bu
        WHERE bu.business_id = $1 AND bu.user_id = pu.id
      `,
      [businessId]
    );
    const action = active ? "platform.business.activate" : "platform.business.suspend";
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action,
      entityType: "business",
      entityId: businessId,
      before: { active: business.active },
      after: { active },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query(
      `
        INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload)
        VALUES ($1, $2, 'business', $1, $3::jsonb)
      `,
      [businessId, active ? "business.activated" : "business.suspended", JSON.stringify({ businessId, active })]
    );
    await client.query("COMMIT");
    return { id: businessId, name: business.name, active };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assignBusinessRole(
  pool: Pool,
  businessId: string,
  userId: string,
  input: RoleAssignmentRequest,
  actor: { userId: string; role: string; ipAddress?: string | undefined; userAgent?: string | undefined }
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ roleId: string; role: string; email: string }>(
      `
        SELECT bu.role_id AS "roleId", r.name AS role, pu.email
        FROM business_users bu
        JOIN roles r ON r.id = bu.role_id
        JOIN platform_users pu ON pu.id = bu.user_id
        WHERE bu.business_id = $1 AND bu.user_id = $2
        FOR UPDATE
      `,
      [businessId, userId]
    );
    if (!current.rows[0]) throw new ApiError(404, "NOT_FOUND", "Business membership not found.");
    const targetRole = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = $1 AND scope = 'business'`,
      [input.role]
    );
    if (!targetRole.rows[0]) throw new ApiError(400, "VALIDATION_ERROR", "Role is not assignable.");
    await client.query(
      `UPDATE business_users SET role_id = $3 WHERE business_id = $1 AND user_id = $2`,
      [businessId, userId, targetRole.rows[0].id]
    );
    await client.query(`UPDATE platform_users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "platform.user.role.assign",
      entityType: "business_user",
      entityId: userId,
      before: { role: current.rows[0].role },
      after: { role: input.role },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    return { userId, email: current.rows[0].email, role: input.role };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBranches(pool: Pool, businessId: string): Promise<unknown[]> {
  const result = await pool.query(
    `
      SELECT id, business_id AS "businessId", name, address_text AS "addressText", timezone, active
      FROM branches
      WHERE business_id = $1
      ORDER BY created_at
    `,
    [businessId]
  );
  return result.rows;
}

export async function createBranch(
  pool: Pool,
  businessId: string,
  input: CreateBranchRequest,
  actor: { userId: string; role: string; ipAddress?: string | undefined; userAgent?: string | undefined }
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const business = await client.query<{ timezone: string }>(
      `SELECT timezone FROM businesses WHERE id = $1 AND active = true FOR SHARE`,
      [businessId]
    );
    if (!business.rows[0]) throw new ApiError(404, "NOT_FOUND", "Active business not found.");
    const result = await client.query(
      `
        INSERT INTO branches (business_id, name, address_text, timezone)
        VALUES ($1, $2, $3, $4)
        RETURNING id, business_id AS "businessId", name, address_text AS "addressText", timezone, active
      `,
      [businessId, input.name, input.addressText ?? null, business.rows[0].timezone]
    );
    const branch = result.rows[0];
    await insertAudit(client, {
      businessId,
      branchId: branch.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.branch.create",
      entityType: "branch",
      entityId: branch.id,
      after: branch,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    return branch;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBusinessUsers(pool: Pool, businessId: string): Promise<unknown[]> {
  const result = await pool.query(
    `
      SELECT pu.id, pu.email, pu.display_name AS "displayName", pu.active, r.name AS role
      FROM business_users bu
      JOIN platform_users pu ON pu.id = bu.user_id
      JOIN roles r ON r.id = bu.role_id
      WHERE bu.business_id = $1
      ORDER BY pu.created_at
    `,
    [businessId]
  );
  return result.rows;
}

export async function insertAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_logs (
        business_id, branch_id, actor_user_id, actor_role, action, entity_type,
        entity_id, before_json, after_json, metadata, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, '{}'::jsonb, $10, $11)
    `,
    [
      input.businessId ?? null,
      input.branchId ?? null,
      input.actorUserId,
      input.actorRole,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );
}
