import { createHash, randomBytes } from "node:crypto";
import {
  assertRedeemable,
  calculateStampsEarned,
  isRewardAvailable,
  stampsUntilReward,
  type LoyaltyProgramRules
} from "@restaurant-os/domain";
import type { LoyaltyAdjustRequest, UpsertLoyaltyProgramRequest } from "@restaurant-os/contracts";
import type { Pool, PoolClient } from "pg";
import { ApiError } from "../errors.js";
import { insertAudit } from "./tenant.js";

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface LoyaltyProgramView {
  id: string;
  name: string;
  description: string | null;
  rewardDescription: string;
  goalCount: number;
  earnPerOrder: number;
  minOrderAmountMinor: number;
  active: boolean;
}

export interface CustomerLoyaltyView {
  linked: boolean;
  program: LoyaltyProgramView | null;
  account: {
    balance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    stampsUntilReward: number;
    rewardAvailable: boolean;
  } | null;
}

interface LoyaltyAccountRow {
  id: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

export async function getActiveProgram(pool: Pool, businessId: string): Promise<LoyaltyProgramView | null> {
  return loadActiveProgram(pool, businessId);
}

export async function resolveCustomerIdForSession(pool: Pool, businessId: string, sessionTokenHash: string): Promise<string | null> {
  const result = await pool.query<{ customerId: string }>(
    `SELECT customer_id AS "customerId" FROM carts WHERE business_id = $1 AND session_token_hash = $2 AND customer_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
    [businessId, sessionTokenHash]
  );
  return result.rows[0]?.customerId ?? null;
}

export async function upsertProgram(
  pool: Pool,
  businessId: string,
  input: UpsertLoyaltyProgramRequest,
  actor: Actor
): Promise<LoyaltyProgramView> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM loyalty_programs WHERE business_id = $1 AND active = true FOR UPDATE`,
      [businessId]
    );
    const values = [
      input.name,
      input.description ?? null,
      input.rewardDescription,
      input.goalCount,
      input.earnPerOrder,
      input.minOrderAmountMinor
    ];
    const returning = `id, name, description, reward_description AS "rewardDescription", goal_count AS "goalCount", earn_per_order AS "earnPerOrder", min_order_amount_minor AS "minOrderAmountMinor", active`;
    const result = existing.rows[0]
      ? await client.query<LoyaltyProgramView>(
          `UPDATE loyalty_programs SET name = $2, description = $3, reward_description = $4, goal_count = $5, earn_per_order = $6, min_order_amount_minor = $7, updated_at = now() WHERE id = $1 RETURNING ${returning}`,
          [existing.rows[0].id, ...values]
        )
      : await client.query<LoyaltyProgramView>(
          `INSERT INTO loyalty_programs (business_id, name, description, reward_description, goal_count, earn_per_order, min_order_amount_minor) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${returning}`,
          [businessId, ...values]
        );
    const program = result.rows[0];
    if (!program) throw new Error("Failed to save loyalty program.");
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.loyalty.program.upsert",
      entityType: "loyalty_program",
      entityId: program.id,
      after: program,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return program;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getCustomerLoyaltyStatus(pool: Pool, businessId: string, customerId: string): Promise<CustomerLoyaltyView> {
  const program = await loadActiveProgram(pool, businessId);
  if (!program) return { linked: false, program: null, account: null };
  const result = await pool.query<LoyaltyAccountRow>(
    `SELECT id, balance, lifetime_earned AS "lifetimeEarned", lifetime_redeemed AS "lifetimeRedeemed" FROM loyalty_accounts WHERE business_id = $1 AND customer_id = $2 AND program_id = $3`,
    [businessId, customerId, program.id]
  );
  const account = result.rows[0] ?? { id: "", balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 };
  const rules = programRules(program);
  return {
    linked: true,
    program,
    account: {
      balance: account.balance,
      lifetimeEarned: account.lifetimeEarned,
      lifetimeRedeemed: account.lifetimeRedeemed,
      stampsUntilReward: stampsUntilReward(account.balance, rules),
      rewardAvailable: isRewardAvailable(account.balance, rules)
    }
  };
}

export async function adjustLoyalty(
  pool: Pool,
  businessId: string,
  customerId: string,
  input: LoyaltyAdjustRequest,
  idempotencyKey: string,
  actor: Actor
): Promise<{ replay: boolean; account: CustomerLoyaltyView }> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    if (await hasExistingTransaction(client, businessId, idempotencyKey)) {
      await client.query("COMMIT");
      committed = true;
      return { replay: true, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
    }
    const program = await loadActiveProgram(client, businessId);
    if (!program) throw new ApiError(404, "LOYALTY_PROGRAM_NOT_CONFIGURED", "No active loyalty program is configured.");
    await assertCustomerExists(client, businessId, customerId);
    const account = await lockOrCreateAccount(client, businessId, customerId, program.id);
    const delta = input.direction === "ADD" ? input.amount : -input.amount;
    const nextBalance = account.balance + delta;
    if (nextBalance < 0) throw new ApiError(400, "LOYALTY_BALANCE_NEGATIVE", "Adjustment would make the balance negative.");
    const transactionType = input.direction === "ADD" ? "ADJUSTMENT_ADD" : "ADJUSTMENT_REMOVE";
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO loyalty_transactions (business_id, loyalty_account_id, customer_id, transaction_type, amount, balance_after, actor_type, actor_user_id, reason, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'user', $7, $8, $9)
       ON CONFLICT (business_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [businessId, account.id, customerId, transactionType, input.amount, nextBalance, actor.userId, input.reason, idempotencyKey]
    );
    if (!inserted.rows[0]) {
      await client.query("COMMIT");
      committed = true;
      return { replay: true, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
    }
    await client.query(
      `UPDATE loyalty_accounts SET balance = $2, lifetime_earned = lifetime_earned + $3, lifetime_redeemed = lifetime_redeemed + $4, updated_at = now() WHERE id = $1`,
      [account.id, nextBalance, input.direction === "ADD" ? input.amount : 0, input.direction === "REMOVE" ? input.amount : 0]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.loyalty.adjust",
      entityType: "loyalty_account",
      entityId: account.id,
      before: { balance: account.balance },
      after: { balance: nextBalance, direction: input.direction, amount: input.amount, reason: input.reason },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return { replay: false, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function redeemLoyalty(
  pool: Pool,
  businessId: string,
  customerId: string,
  idempotencyKey: string,
  actor: Actor
): Promise<{ replay: boolean; account: CustomerLoyaltyView }> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    if (await hasExistingTransaction(client, businessId, idempotencyKey)) {
      await client.query("COMMIT");
      committed = true;
      return { replay: true, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
    }
    const program = await loadActiveProgram(client, businessId);
    if (!program) throw new ApiError(404, "LOYALTY_PROGRAM_NOT_CONFIGURED", "No active loyalty program is configured.");
    await assertCustomerExists(client, businessId, customerId);
    const account = await lockOrCreateAccount(client, businessId, customerId, program.id);
    try {
      assertRedeemable(account.balance, programRules(program));
    } catch (error) {
      throw new ApiError(409, "LOYALTY_REWARD_NOT_AVAILABLE", error instanceof Error ? error.message : "Reward is not available.");
    }
    const nextBalance = account.balance - program.goalCount;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO loyalty_transactions (business_id, loyalty_account_id, customer_id, transaction_type, amount, balance_after, actor_type, actor_user_id, idempotency_key)
       VALUES ($1, $2, $3, 'REDEEM', $4, $5, 'user', $6, $7)
       ON CONFLICT (business_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [businessId, account.id, customerId, program.goalCount, nextBalance, actor.userId, idempotencyKey]
    );
    if (!inserted.rows[0]) {
      await client.query("COMMIT");
      committed = true;
      return { replay: true, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
    }
    await client.query(
      `UPDATE loyalty_accounts SET balance = $2, lifetime_redeemed = lifetime_redeemed + $3, updated_at = now() WHERE id = $1`,
      [account.id, nextBalance, program.goalCount]
    );
    await insertAudit(client, {
      businessId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: "business.loyalty.redeem",
      entityType: "loyalty_account",
      entityId: account.id,
      before: { balance: account.balance },
      after: { balance: nextBalance },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });
    await client.query("COMMIT");
    committed = true;
    return { replay: false, account: await getCustomerLoyaltyStatus(pool, businessId, customerId) };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantOrderStamp(
  client: PoolClient,
  businessId: string,
  order: { id: string; branchId: string; customerId: string | null; itemsSubtotalMinor: number }
): Promise<void> {
  if (!order.customerId) return;
  const program = await loadActiveProgram(client, businessId);
  if (!program) return;
  const stamps = calculateStampsEarned(order.itemsSubtotalMinor, programRules(program));
  if (stamps <= 0) return;
  const account = await lockOrCreateAccount(client, businessId, order.customerId, program.id);
  const nextBalance = account.balance + stamps;
  const idempotencyKey = `order-delivered:${order.id}`;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO loyalty_transactions (business_id, loyalty_account_id, customer_id, branch_id, order_id, transaction_type, amount, balance_after, actor_type, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'EARN', $6, $7, 'system', $8)
     ON CONFLICT (business_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [businessId, account.id, order.customerId, order.branchId, order.id, stamps, nextBalance, idempotencyKey]
  );
  if (!inserted.rows[0]) return;
  await client.query(
    `UPDATE loyalty_accounts SET balance = $2, lifetime_earned = lifetime_earned + $3, updated_at = now() WHERE id = $1`,
    [account.id, nextBalance, stamps]
  );
  await client.query(
    `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'loyalty.stamp_earned', 'loyalty_account', $2, $3::jsonb)`,
    [businessId, account.id, JSON.stringify({ customerId: order.customerId, orderId: order.id, stamps, balance: nextBalance })]
  );
}

export interface LoyaltyClaimTokenResult {
  token: string;
  expiresAt: string;
}

export async function issueLoyaltyClaimToken(
  pool: Pool,
  businessId: string,
  input: { branchId?: string | undefined; orderId?: string | undefined; ttlMinutes?: number | undefined },
  actor: Actor
): Promise<LoyaltyClaimTokenResult> {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashClaimToken(token);
  const ttlMinutes = input.ttlMinutes ?? 15;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await pool.query(
    `INSERT INTO loyalty_claim_tokens (business_id, branch_id, order_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [businessId, input.branchId ?? null, input.orderId ?? null, tokenHash, actor.userId, expiresAt]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Atomically consumes a WhatsApp loyalty claim token and grants a stamp.
 * Must run inside the caller's transaction (see grantOrderStamp for the
 * same pattern) so webhook processing stays all-or-nothing.
 */
export async function consumeLoyaltyClaimToken(
  client: PoolClient,
  businessId: string,
  token: string,
  customerId: string
): Promise<{ stamps: number; balance: number }> {
  const tokenHash = hashClaimToken(token);
  const claimed = await client.query<{ id: string; branchId: string | null }>(
    `UPDATE loyalty_claim_tokens
     SET consumed_at = now(), consumed_by_customer_id = $3
     WHERE business_id = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING id, branch_id AS "branchId"`,
    [businessId, tokenHash, customerId]
  );
  const claim = claimed.rows[0];
  if (!claim) throw new ApiError(409, "LOYALTY_TOKEN_ALREADY_USED", "This loyalty token has already been used.");

  const program = await loadActiveProgram(client, businessId);
  if (!program) throw new ApiError(404, "LOYALTY_PROGRAM_NOT_CONFIGURED", "No active loyalty program is configured.");
  const account = await lockOrCreateAccount(client, businessId, customerId, program.id);
  const stamps = program.earnPerOrder;
  const nextBalance = account.balance + stamps;
  const idempotencyKey = `claim-token:${claim.id}`;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO loyalty_transactions (business_id, loyalty_account_id, customer_id, branch_id, transaction_type, amount, balance_after, actor_type, idempotency_key)
     VALUES ($1, $2, $3, $4, 'EARN', $5, $6, 'system', $7)
     ON CONFLICT (business_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [businessId, account.id, customerId, claim.branchId, stamps, nextBalance, idempotencyKey]
  );
  if (!inserted.rows[0]) return { stamps: 0, balance: account.balance };
  await client.query(
    `UPDATE loyalty_accounts SET balance = $2, lifetime_earned = lifetime_earned + $3, updated_at = now() WHERE id = $1`,
    [account.id, nextBalance, stamps]
  );
  await client.query(
    `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'loyalty.stamp_earned', 'loyalty_account', $2, $3::jsonb)`,
    [businessId, account.id, JSON.stringify({ customerId, stamps, balance: nextBalance, source: "whatsapp_claim" })]
  );
  return { stamps, balance: nextBalance };
}

function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hasExistingTransaction(client: PoolClient, businessId: string, idempotencyKey: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM loyalty_transactions WHERE business_id = $1 AND idempotency_key = $2`,
    [businessId, idempotencyKey]
  );
  return result.rows.length > 0;
}

function programRules(program: LoyaltyProgramView): LoyaltyProgramRules {
  return { goalCount: program.goalCount, earnPerOrder: program.earnPerOrder, minOrderAmountMinor: program.minOrderAmountMinor };
}

async function loadActiveProgram(pool: Pool | PoolClient, businessId: string): Promise<LoyaltyProgramView | null> {
  const result = await pool.query<LoyaltyProgramView>(
    `SELECT id, name, description, reward_description AS "rewardDescription", goal_count AS "goalCount", earn_per_order AS "earnPerOrder", min_order_amount_minor AS "minOrderAmountMinor", active
     FROM loyalty_programs WHERE business_id = $1 AND active = true LIMIT 1`,
    [businessId]
  );
  return result.rows[0] ?? null;
}

async function lockOrCreateAccount(client: PoolClient, businessId: string, customerId: string, programId: string): Promise<LoyaltyAccountRow> {
  const inserted = await client.query<LoyaltyAccountRow>(
    `INSERT INTO loyalty_accounts (business_id, customer_id, program_id) VALUES ($1, $2, $3)
     ON CONFLICT (business_id, customer_id, program_id) DO NOTHING
     RETURNING id, balance, lifetime_earned AS "lifetimeEarned", lifetime_redeemed AS "lifetimeRedeemed"`,
    [businessId, customerId, programId]
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await client.query<LoyaltyAccountRow>(
    `SELECT id, balance, lifetime_earned AS "lifetimeEarned", lifetime_redeemed AS "lifetimeRedeemed" FROM loyalty_accounts WHERE business_id = $1 AND customer_id = $2 AND program_id = $3 FOR UPDATE`,
    [businessId, customerId, programId]
  );
  const row = existing.rows[0];
  if (!row) throw new Error("Failed to load loyalty account.");
  return row;
}

export async function assertCustomerExists(pool: Pool | PoolClient, businessId: string, customerId: string): Promise<void> {
  const result = await pool.query(`SELECT id FROM customers WHERE id = $1 AND business_id = $2`, [customerId, businessId]);
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
}
