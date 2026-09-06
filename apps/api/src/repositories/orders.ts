import { calculateCartLineTotal, calculateCartUnitPrice, calculateDeliveryFee, calculateOrderTotals, canTransitionOrder, type FulfillmentType, type OrderStatus, isProductAvailable, type ProductAvailability, type WeeklySchedule } from "@restaurant-os/domain";
import { OfflinePaymentAdapter } from "@restaurant-os/integrations";
import type { CheckoutRequest, OrderListQuery, OrderTransitionRequest } from "@restaurant-os/contracts";
import type { Pool, PoolClient } from "pg";
import { ApiError } from "../errors.js";
import { grantOrderStamp } from "./loyalty.js";
import { insertAudit, type AuditInput } from "./tenant.js";

const offlinePayments = new OfflinePaymentAdapter();

export interface OrderResponse {
  id: string;
  orderNumber: number;
  businessId: string;
  branchId: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  currency: string;
  scheduledFor: Date | null;
  customer: { id: string | null; name: string; phone: string };
  address: unknown;
  note: string | null;
  deliveryInstructions: string | null;
  items: unknown[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  payment: { method: string; status: string; amountMinor: number };
  createdAt: Date;
  updatedAt: Date;
}

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

interface CartRow {
  id: string;
  businessId: string;
  branchId: string;
  status: string;
}

interface CartItemRow {
  id: string;
  productId: string;
  productName: string;
  productUnitPrice: number;
  variantId: string | null;
  variantName: string | null;
  variantPriceAdjustment: number;
  quantity: number;
}

interface ModifierRow {
  id: string;
  name: string;
  priceAdjustment: number;
  groupId: string;
}

interface OrderItemSnapshot {
  productId: string;
  variantId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  productUnitPrice: number;
  variantPriceAdjustment: number;
  modifiers: ModifierRow[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export async function checkoutOrder(
  pool: Pool,
  sessionTokenHash: string,
  businessId: string,
  input: CheckoutRequest,
  idempotencyKey: string,
  requestHash: string
): Promise<{ replay: boolean; order: OrderResponse }> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const idempotency = await claimIdempotency(client, businessId, idempotencyKey, requestHash);
    if (idempotency.replay) {
      await client.query("COMMIT");
      committed = true;
      return { replay: true, order: idempotency.order };
    }
    const cartResult = await client.query<CartRow>(
      `
        SELECT id, business_id AS "businessId", branch_id AS "branchId", status
        FROM carts
        WHERE session_token_hash = $1 AND business_id = $2 AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [sessionTokenHash, businessId]
    );
    const cart = cartResult.rows[0];
    if (!cart) throw new ApiError(404, "CART_NOT_FOUND", "Active cart not found.");

    const branch = await loadCheckoutBranch(client, businessId, cart.branchId);
    const itemRows = await client.query<CartItemRow>(
      `
        SELECT id, product_id AS "productId", product_name_snapshot AS "productName",
               product_unit_price AS "productUnitPrice", variant_id AS "variantId",
               variant_name_snapshot AS "variantName", variant_price_adjustment AS "variantPriceAdjustment", quantity
        FROM cart_items
        WHERE cart_id = $1 AND business_id = $2 AND branch_id = $3
        ORDER BY created_at
        FOR UPDATE
      `,
      [cart.id, businessId, cart.branchId]
    );
    if (itemRows.rows.length === 0) throw new ApiError(400, "EMPTY_CART", "Cart has no items.");

    const snapshots: OrderItemSnapshot[] = [];
    for (const item of itemRows.rows) {
      const product = await loadProduct(client, businessId, cart.branchId, item.productId, branch.timezone);
      let variant: { id: string; name: string; priceAdjustment: number } | null = null;
      if (item.variantId) {
        variant = await loadVariant(client, businessId, item.productId, item.variantId);
      }
      const modifiers = await loadModifiers(client, businessId, item.productId, item.id);
      await validateModifierRules(client, businessId, item.productId, modifiers);
      const snapshot = {
        productId: product.id,
        variantId: variant?.id ?? null,
        productNameSnapshot: product.name,
        variantNameSnapshot: variant?.name ?? null,
        productUnitPrice: product.basePrice,
        variantPriceAdjustment: variant?.priceAdjustment ?? 0,
        modifiers,
        quantity: item.quantity,
        unitPrice: calculateCartUnitPrice({
          productUnitPrice: product.basePrice,
          variantPriceAdjustment: variant?.priceAdjustment ?? 0,
          modifierPriceAdjustments: modifiers.map((modifier) => modifier.priceAdjustment)
        }),
        lineTotal: 0
      };
      snapshot.lineTotal = calculateCartLineTotal(
        {
          productUnitPrice: snapshot.productUnitPrice,
          variantPriceAdjustment: snapshot.variantPriceAdjustment,
          modifierPriceAdjustments: modifiers.map((modifier) => modifier.priceAdjustment)
        },
        snapshot.quantity
      );
      if (snapshot.unitPrice < 0) throw new ApiError(409, "PRODUCT_UNAVAILABLE", "Product price is invalid.");
      snapshots.push(snapshot);
    }

    const subtotalMinor = snapshots.reduce((sum, item) => sum + item.lineTotal, 0);
    const deliveryFeeMinor = input.fulfillment === "delivery"
      ? await resolveDeliveryFee(client, businessId, cart.branchId, input.address?.district, input.address?.postalCode, subtotalMinor)
      : 0;
    const totals = calculateOrderTotals({ subtotalMinor, deliveryFeeMinor });
    const customerPhone = normalizePhone(input.customer.phone);
    const customer = await upsertCustomer(client, businessId, customerPhone, input.customer.name);
    const addressSnapshot = input.fulfillment === "delivery" && input.address ? input.address : null;
    if (addressSnapshot) await insertCustomerAddress(client, businessId, customer.id, addressSnapshot);
    const orderNumber = await nextOrderNumber(client, businessId);
    const orderResult = await client.query<{ id: string }>(
      `
        INSERT INTO orders (
          business_id, branch_id, cart_id, customer_id, order_number, fulfillment_type,
          scheduled_for, status, currency, customer_name_snapshot, customer_phone_snapshot,
          address_snapshot, note, delivery_instructions, items_subtotal_minor,
          delivery_fee_minor, discount_minor, tax_minor, total_minor
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PLACED', $8, $9, $10, $11::jsonb, $12, $13, $14, $15, 0, 0, $16)
        RETURNING id
      `,
      [
        businessId,
        cart.branchId,
        cart.id,
        customer.id,
        orderNumber,
        input.fulfillment,
        input.scheduledFor ?? null,
        branch.currency,
        input.customer.name,
        customerPhone,
        addressSnapshot ? JSON.stringify(addressSnapshot) : null,
        input.note ?? null,
        input.deliveryInstructions ?? null,
        totals.subtotalMinor,
        totals.deliveryFeeMinor,
        totals.totalMinor
      ]
    );
    const order = orderResult.rows[0];
    if (!order) throw new Error("Failed to create order.");
    for (const item of snapshots) {
      const itemResult = await client.query<{ id: string }>(
        `
          INSERT INTO order_items (
            order_id, business_id, branch_id, product_id, variant_id,
            product_name_snapshot, variant_name_snapshot, product_unit_price,
            variant_price_adjustment, unit_price, quantity, tax, discount, line_total
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, $12)
          RETURNING id
        `,
        [
          order.id,
          businessId,
          cart.branchId,
          item.productId,
          item.variantId,
          item.productNameSnapshot,
          item.variantNameSnapshot,
          item.productUnitPrice,
          item.variantPriceAdjustment,
          item.unitPrice,
          item.quantity,
          item.lineTotal
        ]
      );
      const orderItem = itemResult.rows[0];
      if (!orderItem) throw new Error("Failed to create order item.");
      for (const modifier of item.modifiers) {
        await client.query(
          `INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name_snapshot, modifier_price_adjustment) VALUES ($1, $2, $3, $4)`,
          [orderItem.id, modifier.id, modifier.name, modifier.priceAdjustment]
        );
      }
    }
    await client.query(
      `INSERT INTO order_events (order_id, business_id, branch_id, from_status, to_status, actor_type) VALUES ($1, $2, $3, NULL, 'PLACED', 'customer')`,
      [order.id, businessId, cart.branchId]
    );
    const payment = await offlinePayments.createPayment({
      orderId: order.id,
      amountMinor: totals.totalMinor,
      currency: branch.currency,
      method: input.payment.method
    });
    await client.query(
      `INSERT INTO order_payments (order_id, business_id, branch_id, method, status, amount_minor, provider) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, businessId, cart.branchId, input.payment.method, payment.status, totals.totalMinor, payment.provider]
    );
    await client.query(
      `UPDATE carts SET status = 'checked_out', checked_out_at = now(), updated_at = now(), customer_id = $2 WHERE id = $1`,
      [cart.id, customer.id]
    );
    await client.query(
      `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'order.created', 'order', $2, $3::jsonb)`,
      [businessId, order.id, JSON.stringify({ orderId: order.id, orderNumber })]
    );
    const response = await assembleOrder(client, order.id, businessId);
    await client.query(
      `UPDATE idempotency_keys SET response_status = 201, response_body = $3::jsonb WHERE business_id = $1 AND scope = 'storefront.order.submit' AND key = $2`,
      [businessId, idempotencyKey, JSON.stringify(response)]
    );
    await client.query("COMMIT");
    committed = true;
    return { replay: false, order: response };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listOrders(pool: Pool, businessId: string, query: OrderListQuery): Promise<unknown[]> {
  if (query.branchId) await assertBranch(pool, businessId, query.branchId);
  const result = await pool.query(
    `
      SELECT id, order_number AS "orderNumber", business_id AS "businessId", branch_id AS "branchId",
             status, fulfillment_type AS "fulfillmentType", currency,
             customer_name_snapshot AS "customerName", customer_phone_snapshot AS "customerPhone",
             items_subtotal_minor AS "subtotalMinor", delivery_fee_minor AS "deliveryFeeMinor",
             discount_minor AS "discountMinor", tax_minor AS "taxMinor", total_minor AS "totalMinor",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM orders
      WHERE business_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2)
        AND ($3::text IS NULL OR status = $3)
      ORDER BY created_at DESC
      LIMIT $4
    `,
    [businessId, query.branchId ?? null, query.status ?? null, query.limit]
  );
  return result.rows;
}

export async function getOrder(pool: Pool, businessId: string, orderId: string): Promise<OrderResponse | null> {
  const exists = await pool.query(`SELECT id FROM orders WHERE id = $1 AND business_id = $2`, [orderId, businessId]);
  if (!exists.rows[0]) return null;
  return assembleOrder(pool, orderId, businessId);
}

export async function transitionOrder(
  pool: Pool,
  businessId: string,
  orderId: string,
  input: OrderTransitionRequest,
  actor: Actor
): Promise<OrderResponse> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      branchId: string;
      status: OrderStatus;
      fulfillmentType: FulfillmentType;
      customerId: string | null;
      itemsSubtotalMinor: number;
    }>(
      `SELECT id, branch_id AS "branchId", status, fulfillment_type AS "fulfillmentType", customer_id AS "customerId", items_subtotal_minor AS "itemsSubtotalMinor" FROM orders WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [orderId, businessId]
    );
    const order = result.rows[0];
    if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
    if (!roleCanTransition(actor.role, input.toStatus)) {
      throw new ApiError(403, "FORBIDDEN", "Your role cannot perform this order transition.");
    }
    if (!canTransitionOrder(order.status, input.toStatus, order.fulfillmentType)) {
      throw new ApiError(409, "INVALID_STATE_TRANSITION", `Cannot move order from ${order.status} to ${input.toStatus}.`);
    }
    await client.query(
      `
        UPDATE orders
        SET status = $3,
            accepted_at = CASE WHEN $3 = 'ACCEPTED' THEN now() ELSE accepted_at END,
            preparing_at = CASE WHEN $3 = 'PREPARING' THEN now() ELSE preparing_at END,
            ready_at = CASE WHEN $3 = 'READY' THEN now() ELSE ready_at END,
            delivered_at = CASE WHEN $3 = 'DELIVERED' THEN now() ELSE delivered_at END,
            cancelled_at = CASE WHEN $3 = 'CANCELLED' THEN now() ELSE cancelled_at END,
            updated_at = now()
        WHERE id = $1 AND business_id = $2
      `,
      [orderId, businessId, input.toStatus]
    );
    await client.query(
      `INSERT INTO order_events (order_id, business_id, branch_id, from_status, to_status, actor_type, actor_user_id, reason) VALUES ($1, $2, $3, $4, $5, 'user', $6, $7)`,
      [orderId, businessId, order.branchId, order.status, input.toStatus, actor.userId, input.reason ?? null]
    );
    if (input.toStatus === "REFUNDED") {
      await client.query(`UPDATE order_payments SET status = 'REFUNDED', updated_at = now() WHERE order_id = $1 AND business_id = $2`, [orderId, businessId]);
    }
    if (input.toStatus === "DELIVERED") {
      await grantOrderStamp(client, businessId, {
        id: orderId,
        branchId: order.branchId,
        customerId: order.customerId,
        itemsSubtotalMinor: order.itemsSubtotalMinor
      });
    }
    await client.query(
      `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'order.status_changed', 'order', $2, $3::jsonb)`,
      [businessId, orderId, JSON.stringify({ orderId, fromStatus: order.status, toStatus: input.toStatus, reason: input.reason ?? null })]
    );
    if (["REJECTED", "CANCELLED", "REFUNDED"].includes(input.toStatus)) {
      const audit: AuditInput = {
        businessId,
        branchId: order.branchId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: `business.order.${input.toStatus.toLowerCase()}`,
        entityType: "order",
        entityId: orderId,
        before: { status: order.status },
        after: { status: input.toStatus, reason: input.reason ?? null },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent
      };
      await insertAudit(client, audit);
    }
    const response = await assembleOrder(client, orderId, businessId);
    await client.query("COMMIT");
    committed = true;
    return response;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function claimIdempotency(
  client: PoolClient,
  businessId: string,
  key: string,
  requestHash: string
): Promise<{ replay: false } | { replay: true; order: OrderResponse }> {
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO idempotency_keys (business_id, scope, key, request_hash, expires_at)
      VALUES ($1, 'storefront.order.submit', $2, $3, now() + interval '24 hours')
      ON CONFLICT (business_id, scope, key) DO NOTHING
      RETURNING id
    `,
    [businessId, key, requestHash]
  );
  if (inserted.rows[0]) return { replay: false };
  const existing = await client.query<{ requestHash: string; responseBody: OrderResponse | null; expiresAt: Date | null }>(
    `SELECT request_hash AS "requestHash", response_body AS "responseBody", expires_at AS "expiresAt" FROM idempotency_keys WHERE business_id = $1 AND scope = 'storefront.order.submit' AND key = $2 FOR UPDATE`,
    [businessId, key]
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This request is already being processed.");
  if (row.requestHash !== requestHash) throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was used with a different request.");
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    await client.query(
      `UPDATE idempotency_keys SET request_hash = $3, response_status = NULL, response_body = NULL, expires_at = now() + interval '24 hours' WHERE business_id = $1 AND scope = 'storefront.order.submit' AND key = $2`,
      [businessId, key, requestHash]
    );
    return { replay: false };
  }
  if (!row.responseBody) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This request is already being processed.");
  return { replay: true, order: row.responseBody };
}

async function loadCheckoutBranch(client: PoolClient, businessId: string, branchId: string): Promise<{ timezone: string; currency: string }> {
  const result = await client.query<{ timezone: string; currency: string }>(
    `SELECT COALESCE(br.timezone, b.timezone) AS timezone, b.currency FROM branches br JOIN businesses b ON b.id = br.business_id WHERE br.id = $1 AND br.business_id = $2 AND br.active = true AND b.active = true FOR SHARE`,
    [branchId, businessId]
  );
  const branch = result.rows[0];
  if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch is not available.");
  return branch;
}

async function loadProduct(client: PoolClient, businessId: string, branchId: string, productId: string, timezone: string): Promise<{ id: string; name: string; basePrice: number }> {
  const result = await client.query<{ id: string; name: string; basePrice: number }>(
    `SELECT id, name, base_price AS "basePrice" FROM products WHERE id = $1 AND business_id = $2 AND active = true`,
    [productId, businessId]
  );
  const product = result.rows[0];
  if (!product) throw new ApiError(409, "PRODUCT_UNAVAILABLE", "A product in the cart is no longer available.");
  const availability = await client.query<{ available: boolean; availableFrom: Date | null; availableUntil: Date | null; schedule: unknown }>(
    `SELECT available, available_from AS "availableFrom", available_until AS "availableUntil", schedule FROM product_branch_availability WHERE product_id = $1 AND business_id = $2 AND branch_id = $3`,
    [productId, businessId, branchId]
  );
  const row = availability.rows[0];
  const productAvailability: ProductAvailability | null = row
    ? { available: row.available, availableFrom: row.availableFrom, availableUntil: row.availableUntil, schedule: row.schedule as WeeklySchedule }
    : null;
  if (!isProductAvailable(productAvailability, new Date(), timezone)) {
    throw new ApiError(409, "PRODUCT_UNAVAILABLE", "A product in the cart is no longer available.");
  }
  return product;
}

async function loadVariant(client: PoolClient, businessId: string, productId: string, variantId: string): Promise<{ id: string; name: string; priceAdjustment: number }> {
  const result = await client.query<{ id: string; name: string; priceAdjustment: number }>(
    `SELECT id, name, price_adjustment AS "priceAdjustment" FROM product_variants WHERE id = $1 AND product_id = $2 AND business_id = $3 AND active = true`,
    [variantId, productId, businessId]
  );
  const variant = result.rows[0];
  if (!variant) throw new ApiError(409, "PRODUCT_UNAVAILABLE", "A product variant in the cart is no longer available.");
  return variant;
}

async function loadModifiers(client: PoolClient, businessId: string, productId: string, cartItemId: string): Promise<ModifierRow[]> {
  const result = await client.query<ModifierRow>(
    `
      SELECT m.id, m.name, m.price_adjustment AS "priceAdjustment", mg.id AS "groupId"
      FROM cart_item_modifiers cim
      JOIN modifiers m ON m.id = cim.modifier_id AND m.business_id = $1 AND m.active = true
      JOIN modifier_groups mg ON mg.id = m.modifier_group_id AND mg.business_id = $1 AND mg.product_id = $2
      WHERE cim.cart_item_id = $3
      ORDER BY cim.id
    `,
    [businessId, productId, cartItemId]
  );
  const countResult = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM cart_item_modifiers WHERE cart_item_id = $1`, [cartItemId]);
  if (Number(countResult.rows[0]?.count ?? 0) !== result.rows.length) {
    throw new ApiError(409, "PRODUCT_UNAVAILABLE", "A modifier in the cart is no longer available.");
  }
  return result.rows;
}

async function validateModifierRules(client: PoolClient, businessId: string, productId: string, modifiers: ModifierRow[]): Promise<void> {
  const groups = await client.query<{ id: string; required: boolean; minSelections: number; maxSelections: number; multiSelect: boolean }>(
    `SELECT id, required, min_selections AS "minSelections", max_selections AS "maxSelections", multi_select AS "multiSelect" FROM modifier_groups WHERE business_id = $1 AND product_id = $2`,
    [businessId, productId]
  );
  const byGroup = new Map<string, number>();
  for (const modifier of modifiers) byGroup.set(modifier.groupId, (byGroup.get(modifier.groupId) ?? 0) + 1);
  for (const group of groups.rows) {
    const count = byGroup.get(group.id) ?? 0;
    if ((group.required && count < Math.max(1, group.minSelections)) || count < group.minSelections || count > group.maxSelections || (!group.multiSelect && count > 1)) {
      throw new ApiError(400, "MODIFIER_SELECTION_INVALID", "Cart modifier selection is no longer valid.");
    }
  }
}

async function resolveDeliveryFee(client: PoolClient, businessId: string, branchId: string, district: string | undefined, postalCode: string | undefined, subtotalMinor: number): Promise<number> {
  const result = await client.query<{ districts: unknown; postalCodes: unknown; minOrderMinor: number; deliveryFeeMinor: number; freeDeliveryThresholdMinor: number | null }>(
    `SELECT districts, postal_codes AS "postalCodes", min_order_minor AS "minOrderMinor", delivery_fee_minor AS "deliveryFeeMinor", free_delivery_threshold_minor AS "freeDeliveryThresholdMinor" FROM delivery_zones WHERE business_id = $1 AND branch_id = $2 AND active = true ORDER BY created_at`,
    [businessId, branchId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(409, "DELIVERY_ZONE_UNAVAILABLE", "Delivery is not configured for this branch.");
  }
  const zone = result.rows.find((candidate) => {
    const districts = Array.isArray(candidate.districts) ? candidate.districts : [];
    const postalCodes = Array.isArray(candidate.postalCodes) ? candidate.postalCodes : [];
    return (district && districts.includes(district)) || (postalCode && postalCodes.includes(postalCode));
  });
  if (!zone) throw new ApiError(409, "DELIVERY_ZONE_UNAVAILABLE", "Delivery is not available for this address.");
  try {
    return calculateDeliveryFee({
      subtotalMinor,
      deliveryFeeMinor: zone.deliveryFeeMinor,
      minOrderMinor: zone.minOrderMinor,
      freeDeliveryThresholdMinor: zone.freeDeliveryThresholdMinor
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Order minimum has not been reached.") {
      throw new ApiError(400, "DELIVERY_MINIMUM_NOT_REACHED", error.message);
    }
    throw error;
  }
}

async function upsertCustomer(client: PoolClient, businessId: string, phone: string, name: string): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO customers (business_id, phone, name) VALUES ($1, $2, $3) ON CONFLICT (business_id, phone) DO UPDATE SET name = EXCLUDED.name, updated_at = now() RETURNING id`,
    [businessId, phone, name]
  );
  const customer = result.rows[0];
  if (!customer) throw new Error("Failed to create customer.");
  return customer;
}

async function insertCustomerAddress(client: PoolClient, businessId: string, customerId: string, address: NonNullable<CheckoutRequest["address"]>): Promise<void> {
  await client.query(
    `INSERT INTO customer_addresses (business_id, customer_id, label, address_text, district, city, postal_code, lat, lng, building, apartment, floor, instructions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [businessId, customerId, address.label ?? null, address.addressText, address.district ?? null, address.city ?? null, address.postalCode ?? null, address.lat ?? null, address.lng ?? null, address.building ?? null, address.apartment ?? null, address.floor ?? null, address.instructions ?? null]
  );
}

async function nextOrderNumber(client: PoolClient, businessId: string): Promise<number> {
  await client.query(`SELECT id FROM businesses WHERE id = $1 FOR UPDATE`, [businessId]);
  const result = await client.query<{ nextNumber: number }>(`SELECT COALESCE(MAX(order_number), 0) + 1 AS "nextNumber" FROM orders WHERE business_id = $1`, [businessId]);
  const row = result.rows[0];
  if (!row) throw new Error("Failed to allocate order number.");
  return row.nextNumber;
}

async function assembleOrder(pool: Pool | PoolClient, orderId: string, businessId: string): Promise<OrderResponse> {
  const orderResult = await pool.query<{
    id: string; orderNumber: number; branchId: string; status: OrderStatus; fulfillmentType: FulfillmentType;
    currency: string; scheduledFor: Date | null; customerId: string | null; customerName: string;
    customerPhone: string; address: unknown; note: string | null; deliveryInstructions: string | null;
    subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number; taxMinor: number; totalMinor: number;
    createdAt: Date; updatedAt: Date;
  }>(
    `
      SELECT id, order_number AS "orderNumber", branch_id AS "branchId", status,
             fulfillment_type AS "fulfillmentType", currency, scheduled_for AS "scheduledFor",
             customer_id AS "customerId", customer_name_snapshot AS "customerName",
             customer_phone_snapshot AS "customerPhone", address_snapshot AS address, note,
             delivery_instructions AS "deliveryInstructions", items_subtotal_minor AS "subtotalMinor",
             delivery_fee_minor AS "deliveryFeeMinor", discount_minor AS "discountMinor",
             tax_minor AS "taxMinor", total_minor AS "totalMinor", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM orders WHERE id = $1 AND business_id = $2
    `,
    [orderId, businessId]
  );
  const row = orderResult.rows[0];
  if (!row) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const [items, payment] = await Promise.all([
    pool.query<{ id: string; productId: string | null; productNameSnapshot: string; variantId: string | null; variantNameSnapshot: string | null; productUnitPrice: number; variantPriceAdjustment: number; unitPrice: number; quantity: number; lineTotal: number }>(
      `SELECT id, product_id AS "productId", product_name_snapshot AS "productNameSnapshot", variant_id AS "variantId", variant_name_snapshot AS "variantNameSnapshot", product_unit_price AS "productUnitPrice", variant_price_adjustment AS "variantPriceAdjustment", unit_price AS "unitPrice", quantity, line_total AS "lineTotal" FROM order_items WHERE order_id = $1 AND business_id = $2 ORDER BY created_at`,
      [orderId, businessId]
    ),
    pool.query<{ method: string; status: string; amountMinor: number }>(
      `SELECT method, status, amount_minor AS "amountMinor" FROM order_payments WHERE order_id = $1 AND business_id = $2 ORDER BY created_at LIMIT 1`,
      [orderId, businessId]
    )
  ]);
  const modifierRows = items.rows.length
    ? await pool.query<{ orderItemId: string; id: string | null; name: string; priceAdjustment: number }>(
        `SELECT order_item_id AS "orderItemId", modifier_id AS id, modifier_name_snapshot AS name, modifier_price_adjustment AS "priceAdjustment" FROM order_item_modifiers WHERE order_item_id = ANY($1::uuid[]) ORDER BY id`,
        [items.rows.map((item) => item.id)]
      )
    : { rows: [] as Array<{ orderItemId: string; id: string | null; name: string; priceAdjustment: number }> };
  const modifiersByItem = new Map<string, typeof modifierRows.rows>();
  for (const modifier of modifierRows.rows) {
    const list = modifiersByItem.get(modifier.orderItemId) ?? [];
    list.push(modifier);
    modifiersByItem.set(modifier.orderItemId, list);
  }
  const orderPayment = payment.rows[0];
  if (!orderPayment) throw new Error("Order payment is missing.");
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    businessId,
    branchId: row.branchId,
    status: row.status,
    fulfillmentType: row.fulfillmentType,
    currency: row.currency,
    scheduledFor: row.scheduledFor,
    customer: { id: row.customerId, name: row.customerName, phone: row.customerPhone },
    address: row.address,
    note: row.note,
    deliveryInstructions: row.deliveryInstructions,
    items: items.rows.map((item) => ({ ...item, modifiers: modifiersByItem.get(item.id) ?? [] })),
    subtotalMinor: row.subtotalMinor,
    deliveryFeeMinor: row.deliveryFeeMinor,
    discountMinor: row.discountMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    payment: orderPayment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function assertBranch(pool: Pool, businessId: string, branchId: string): Promise<void> {
  const result = await pool.query(`SELECT id FROM branches WHERE id = $1 AND business_id = $2`, [branchId, businessId]);
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 20) throw new ApiError(400, "VALIDATION_ERROR", "Phone number is invalid.");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

function roleCanTransition(role: string, toStatus: OrderTransitionRequest["toStatus"]): boolean {
  if (role === "OWNER" || role === "MANAGER") return true;
  if (role === "CASHIER") return ["ACCEPTED", "REJECTED", "CANCELLED"].includes(toStatus);
  if (role === "KITCHEN") return ["PREPARING", "READY"].includes(toStatus);
  return false;
}
