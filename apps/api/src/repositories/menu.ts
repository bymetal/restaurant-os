import type { Pool, PoolClient } from "pg";
import type {
  AddCartItemRequest,
  AvailabilityRequest,
  CreateCategoryRequest,
  CreateModifierGroupRequest,
  CreateModifierRequest,
  CreateProductRequest,
  CreateVariantRequest
} from "@restaurant-os/contracts";
import {
  calculateCartLineTotal,
  calculateCartUnitPrice,
  isProductAvailable,
  type ProductAvailability,
  type WeeklySchedule
} from "@restaurant-os/domain";
import { ApiError } from "../errors.js";
import { insertAudit, type AuditInput } from "./tenant.js";

export interface MenuProduct {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  photoUrl: string | null;
  basePrice: number;
  allergens: string[];
  tags: string[];
  sortOrder: number;
  active: boolean;
  variants: unknown[];
  modifierGroups: unknown[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  products: MenuProduct[];
}

export interface MenuTree {
  categories: MenuCategory[];
}

export interface PublicRestaurant {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  branches: Array<{ id: string; slug: string; name: string; addressText: string | null }>;
}

interface Actor {
  userId: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

interface MenuRows {
  categories: Array<{ id: string; name: string; description: string | null; sortOrder: number; active: boolean }>;
  products: Array<{
    id: string;
    categoryId: string | null;
    name: string;
    description: string | null;
    photoUrl: string | null;
    basePrice: number;
    allergens: unknown;
    tags: unknown;
    sortOrder: number;
    active: boolean;
  }>;
  variants: Array<{ id: string; productId: string; name: string; priceAdjustment: number; sortOrder: number; active: boolean }>;
  groups: Array<{
    id: string;
    productId: string;
    name: string;
    required: boolean;
    minSelections: number;
    maxSelections: number;
    multiSelect: boolean;
    sortOrder: number;
  }>;
  modifiers: Array<{ id: string; groupId: string; name: string; priceAdjustment: number; sortOrder: number; active: boolean }>;
  availability: Array<{
    productId: string;
    available: boolean;
    availableFrom: Date | null;
    availableUntil: Date | null;
    schedule: unknown;
  }>;
}

export async function getMenu(pool: Pool, businessId: string, branchId?: string, publicOnly = false): Promise<MenuTree> {
  const timezone = branchId ? await branchTimezone(pool, businessId, branchId) : "Europe/Istanbul";
  const [categories, products, variants, groups, modifiers, availability] = await Promise.all([
    pool.query<MenuRows["categories"][number]>(
      `SELECT id, name, description, sort_order AS "sortOrder", active FROM categories WHERE business_id = $1 ORDER BY sort_order, created_at`,
      [businessId]
    ),
    pool.query<MenuRows["products"][number]>(
      `
        SELECT id, category_id AS "categoryId", name, description, photo_url AS "photoUrl",
               base_price AS "basePrice", allergens, tags, sort_order AS "sortOrder", active
        FROM products WHERE business_id = $1 ORDER BY sort_order, created_at
      `,
      [businessId]
    ),
    pool.query<MenuRows["variants"][number]>(
      `
        SELECT id, product_id AS "productId", name, price_adjustment AS "priceAdjustment",
               sort_order AS "sortOrder", active
        FROM product_variants WHERE business_id = $1 ORDER BY sort_order, created_at
      `,
      [businessId]
    ),
    pool.query<MenuRows["groups"][number]>(
      `
        SELECT id, product_id AS "productId", name, required,
               min_selections AS "minSelections", max_selections AS "maxSelections",
               multi_select AS "multiSelect", sort_order AS "sortOrder"
        FROM modifier_groups WHERE business_id = $1 ORDER BY sort_order, created_at
      `,
      [businessId]
    ),
    pool.query<MenuRows["modifiers"][number]>(
      `
        SELECT id, modifier_group_id AS "groupId", name,
               price_adjustment AS "priceAdjustment", sort_order AS "sortOrder", active
        FROM modifiers WHERE business_id = $1 ORDER BY sort_order, created_at
      `,
      [businessId]
    ),
    branchId
      ? pool.query<MenuRows["availability"][number]>(
          `
            SELECT product_id AS "productId", available,
                   available_from AS "availableFrom", available_until AS "availableUntil", schedule
            FROM product_branch_availability
            WHERE business_id = $1 AND branch_id = $2
          `,
          [businessId, branchId]
        )
      : Promise.resolve({ rows: [] as MenuRows["availability"] })
  ]);

  const availabilityMap = new Map(availability.rows.map((row) => [row.productId, row]));
  const groupsByProduct = new Map<string, MenuRows["groups"]>();
  for (const group of groups.rows) {
    const productGroups = groupsByProduct.get(group.productId) ?? [];
    productGroups.push(group);
    groupsByProduct.set(group.productId, productGroups);
  }
  const modifiersByGroup = new Map<string, MenuRows["modifiers"]>();
  for (const modifier of modifiers.rows) {
    const groupModifiers = modifiersByGroup.get(modifier.groupId) ?? [];
    groupModifiers.push(modifier);
    modifiersByGroup.set(modifier.groupId, groupModifiers);
  }
  const variantsByProduct = new Map<string, MenuRows["variants"]>();
  for (const variant of variants.rows) {
    const productVariants = variantsByProduct.get(variant.productId) ?? [];
    productVariants.push(variant);
    variantsByProduct.set(variant.productId, productVariants);
  }
  const productsByCategory = new Map<string, MenuProduct[]>();
  for (const product of products.rows) {
    if (publicOnly && !product.active) continue;
    const availabilityRow = availabilityMap.get(product.id);
    if (
      publicOnly &&
      !isProductAvailable(
        availabilityRow
          ? {
              available: availabilityRow.available,
              availableFrom: availabilityRow.availableFrom,
              availableUntil: availabilityRow.availableUntil,
              schedule: availabilityRow.schedule as WeeklySchedule
            }
          : null,
        new Date(),
        timezone
      )
    ) continue;
    const productGroups = (groupsByProduct.get(product.id) ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      multiSelect: group.multiSelect,
      sortOrder: group.sortOrder,
      modifiers: (modifiersByGroup.get(group.id) ?? [])
        .filter((modifier) => !publicOnly || modifier.active)
        .map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          priceAdjustment: modifier.priceAdjustment,
          sortOrder: modifier.sortOrder,
          active: modifier.active
        }))
    }));
    const menuProduct: MenuProduct = {
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      description: product.description,
      photoUrl: product.photoUrl,
      basePrice: product.basePrice,
      allergens: jsonStringArray(product.allergens),
      tags: jsonStringArray(product.tags),
      sortOrder: product.sortOrder,
      active: product.active,
      variants: (variantsByProduct.get(product.id) ?? [])
        .filter((variant) => !publicOnly || variant.active)
        .map((variant) => ({ ...variant })),
      modifierGroups: productGroups
    };
    const categoryId = product.categoryId ?? "__uncategorized__";
    const categoryProducts = productsByCategory.get(categoryId) ?? [];
    categoryProducts.push(menuProduct);
    productsByCategory.set(categoryId, categoryProducts);
  }

  return {
    categories: categories.rows
      .filter((category) => !publicOnly || category.active)
      .map((category) => ({ ...category, products: productsByCategory.get(category.id) ?? [] })),
  };
}

export async function getPublicRestaurant(pool: Pool, slug: string): Promise<PublicRestaurant | null> {
  const result = await pool.query<{
    id: string;
    slug: string;
    name: string;
    timezone: string;
    currency: string;
  }>(
    `SELECT id, slug, name, timezone, currency FROM businesses WHERE slug = $1 AND active = true`,
    [slug]
  );
  const business = result.rows[0];
  if (!business) return null;
  const branches = await pool.query<{ id: string; slug: string; name: string; addressText: string | null }>(
    `SELECT id, slug, name, address_text AS "addressText" FROM branches WHERE business_id = $1 AND active = true ORDER BY created_at`,
    [business.id]
  );
  return { ...business, branches: branches.rows };
}

export async function findPublicBranch(pool: Pool, businessId: string, branchSlug?: string): Promise<{ id: string; timezone: string } | null> {
  const result = await pool.query<{ id: string; timezone: string }>(
    `
      SELECT id, COALESCE(timezone, (SELECT timezone FROM businesses WHERE id = $1)) AS timezone
      FROM branches
      WHERE business_id = $1 AND active = true AND ($2::text IS NULL OR slug = $2)
      ORDER BY CASE WHEN $2::text IS NOT NULL THEN 0 ELSE 1 END, created_at
      LIMIT 1
    `,
    [businessId, branchSlug ?? null]
  );
  return result.rows[0] ?? null;
}

export async function createCategory(pool: Pool, businessId: string, input: CreateCategoryRequest, actor: Actor): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    const result = await client.query(
      `
        INSERT INTO categories (business_id, name, description, sort_order, active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, sort_order AS "sortOrder", active
      `,
      [businessId, input.name, input.description ?? null, input.sortOrder, input.active]
    );
    const category = result.rows[0];
    if (!category) throw new Error("Failed to create category.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.category.create",
      entityType: "category",
      entityId: category.id,
      after: category,
      eventType: "menu.category.created",
      payload: { categoryId: category.id }
    });
    return category;
  });
}

export async function createProduct(pool: Pool, businessId: string, input: CreateProductRequest, actor: Actor): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    if (input.categoryId) await assertCategory(client, businessId, input.categoryId);
    const result = await client.query(
      `
        INSERT INTO products (business_id, category_id, name, description, photo_url, base_price, allergens, tags, prep_metadata, sort_order, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)
        RETURNING id, category_id AS "categoryId", name, description, photo_url AS "photoUrl", base_price AS "basePrice", sort_order AS "sortOrder", active
      `,
      [
        businessId,
        input.categoryId ?? null,
        input.name,
        input.description ?? null,
        input.photoUrl ?? null,
        input.basePrice,
        JSON.stringify(input.allergens),
        JSON.stringify(input.tags),
        JSON.stringify(input.prepMetadata),
        input.sortOrder,
        input.active
      ]
    );
    const product = result.rows[0];
    if (!product) throw new Error("Failed to create product.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.product.create",
      entityType: "product",
      entityId: product.id,
      after: product,
      eventType: "menu.product.created",
      payload: { productId: product.id }
    });
    return product;
  });
}

export async function createVariant(pool: Pool, businessId: string, productId: string, input: CreateVariantRequest, actor: Actor): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    const product = await client.query<{ basePrice: number }>(
      `SELECT base_price AS "basePrice" FROM products WHERE id = $1 AND business_id = $2`,
      [productId, businessId]
    );
    const productRow = product.rows[0];
    if (!productRow) throw new ApiError(404, "NOT_FOUND", "Product not found.");
    if (input.priceAdjustment < -productRow.basePrice) {
      throw new ApiError(400, "VALIDATION_ERROR", "Variant price cannot make the product total negative.");
    }
    const result = await client.query(
      `
        INSERT INTO product_variants (business_id, product_id, name, price_adjustment, sort_order, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, product_id AS "productId", name, price_adjustment AS "priceAdjustment", sort_order AS "sortOrder", active
      `,
      [businessId, productId, input.name, input.priceAdjustment, input.sortOrder, input.active]
    );
    const variant = result.rows[0];
    if (!variant) throw new Error("Failed to create variant.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.variant.create",
      entityType: "product_variant",
      entityId: variant.id,
      after: variant,
      eventType: "menu.variant.created",
      payload: { variantId: variant.id, productId }
    });
    return variant;
  });
}

export async function createModifierGroup(pool: Pool, businessId: string, productId: string, input: CreateModifierGroupRequest, actor: Actor): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    await assertProduct(client, businessId, productId);
    const result = await client.query(
      `
        INSERT INTO modifier_groups (business_id, product_id, name, required, min_selections, max_selections, multi_select, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, product_id AS "productId", name, required, min_selections AS "minSelections", max_selections AS "maxSelections", multi_select AS "multiSelect", sort_order AS "sortOrder"
      `,
      [businessId, productId, input.name, input.required, input.minSelections, input.maxSelections, input.multiSelect, input.sortOrder]
    );
    const group = result.rows[0];
    if (!group) throw new Error("Failed to create modifier group.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.modifier_group.create",
      entityType: "modifier_group",
      entityId: group.id,
      after: group,
      eventType: "menu.modifier_group.created",
      payload: { modifierGroupId: group.id, productId }
    });
    return group;
  });
}

export async function createModifier(pool: Pool, businessId: string, groupId: string, input: CreateModifierRequest, actor: Actor): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    const group = await client.query<{ id: string }>(
      `SELECT id FROM modifier_groups WHERE id = $1 AND business_id = $2`,
      [groupId, businessId]
    );
    if (!group.rows[0]) throw new ApiError(404, "NOT_FOUND", "Modifier group not found.");
    const result = await client.query(
      `
        INSERT INTO modifiers (business_id, modifier_group_id, name, price_adjustment, sort_order, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, modifier_group_id AS "modifierGroupId", name, price_adjustment AS "priceAdjustment", sort_order AS "sortOrder", active
      `,
      [businessId, groupId, input.name, input.priceAdjustment, input.sortOrder, input.active]
    );
    const modifier = result.rows[0];
    if (!modifier) throw new Error("Failed to create modifier.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.modifier.create",
      entityType: "modifier",
      entityId: modifier.id,
      after: modifier,
      eventType: "menu.modifier.created",
      payload: { modifierId: modifier.id, modifierGroupId: groupId }
    });
    return modifier;
  });
}

export async function upsertAvailability(
  pool: Pool,
  businessId: string,
  productId: string,
  branchId: string,
  input: AvailabilityRequest,
  actor: Actor
): Promise<unknown> {
  return withMenuTransaction(pool, async (client) => {
    await assertProduct(client, businessId, productId);
    const branch = await client.query(`SELECT id FROM branches WHERE id = $1 AND business_id = $2 AND active = true`, [branchId, businessId]);
    if (!branch.rows[0]) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
    const result = await client.query(
      `
        INSERT INTO product_branch_availability (business_id, product_id, branch_id, available, available_from, available_until, schedule)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (product_id, branch_id) DO UPDATE SET
          available = EXCLUDED.available,
          available_from = EXCLUDED.available_from,
          available_until = EXCLUDED.available_until,
          schedule = EXCLUDED.schedule,
          updated_at = now()
        RETURNING id, product_id AS "productId", branch_id AS "branchId", available,
                  available_from AS "availableFrom", available_until AS "availableUntil", schedule
      `,
      [
        businessId,
        productId,
        branchId,
        input.available,
        input.availableFrom ?? null,
        input.availableUntil ?? null,
        JSON.stringify(input.schedule)
      ]
    );
    const availability = result.rows[0];
    if (!availability) throw new Error("Failed to update availability.");
    await recordMenuMutation(client, {
      businessId,
      actor,
      action: "business.product.availability.update",
      entityType: "product_branch_availability",
      entityId: availability.id,
      after: availability,
      eventType: "menu.product.availability_updated",
      payload: { productId, branchId }
    });
    return availability;
  });
}

export async function createCart(
  pool: Pool,
  businessId: string,
  branchId: string,
  sessionTokenHash: string,
  source?: string
): Promise<CartResponse> {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO carts (business_id, branch_id, session_token_hash, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (session_token_hash, branch_id) WHERE status = 'active'
      DO UPDATE SET updated_at = now(), last_active_at = now()
      RETURNING id
    `,
    [businessId, branchId, sessionTokenHash, source ?? null]
  );
  const cart = result.rows[0];
  if (!cart) throw new Error("Failed to create cart.");
  return getCart(pool, sessionTokenHash, cart.id);
}

export async function getCart(pool: Pool, sessionTokenHash: string, cartId?: string, businessId?: string): Promise<CartResponse> {
  const result = await pool.query<CartRow>(
    `
      SELECT id, business_id AS "businessId", branch_id AS "branchId", status, source,
             started_at AS "startedAt", updated_at AS "updatedAt"
      FROM carts
      WHERE session_token_hash = $1
        AND status = 'active'
        AND ($2::uuid IS NULL OR id = $2)
        AND ($3::uuid IS NULL OR business_id = $3)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [sessionTokenHash, cartId ?? null, businessId ?? null]
  );
  const cart = result.rows[0];
  if (!cart) throw new ApiError(404, "NOT_FOUND", "Cart not found.");
  return assembleCart(pool, cart);
}

export async function addCartItem(
  pool: Pool,
  sessionTokenHash: string,
  businessId: string,
  input: AddCartItemRequest,
  idempotencyKey: string | undefined,
  requestHash: string
): Promise<{ replay: boolean; cart: CartResponse }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cartResult = await client.query<CartRow>(
      `
        SELECT id, business_id AS "businessId", branch_id AS "branchId", status, source,
               started_at AS "startedAt", updated_at AS "updatedAt"
        FROM carts
        WHERE session_token_hash = $1 AND business_id = $2 AND status = 'active'
        FOR UPDATE
      `,
      [sessionTokenHash, businessId]
    );
    const cart = cartResult.rows[0];
    if (!cart) throw new ApiError(401, "CART_SESSION_MISSING", "Cart session is required.");
    if (idempotencyKey) {
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO idempotency_keys (business_id, scope, key, request_hash, expires_at)
          VALUES ($1, 'storefront.cart.add', $2, $3, now() + interval '24 hours')
          ON CONFLICT (business_id, scope, key) DO NOTHING
          RETURNING id
        `,
        [cart.businessId, idempotencyKey, requestHash]
      );
      if (inserted.rows.length === 0) {
        const existing = await client.query<{ requestHash: string; responseBody: CartResponse | null; expiresAt: Date | null }>(
          `SELECT request_hash AS "requestHash", response_body AS "responseBody", expires_at AS "expiresAt" FROM idempotency_keys WHERE business_id = $1 AND scope = 'storefront.cart.add' AND key = $2 FOR UPDATE`,
          [cart.businessId, idempotencyKey]
        );
        const row = existing.rows[0];
        if (!row) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This request is already being processed.");
        if (row.requestHash !== requestHash) {
          throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was used with a different request.");
        }
        if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
          await client.query(
            `UPDATE idempotency_keys SET request_hash = $3, response_status = NULL, response_body = NULL, expires_at = now() + interval '24 hours' WHERE business_id = $1 AND scope = 'storefront.cart.add' AND key = $2`,
            [cart.businessId, idempotencyKey, requestHash]
          );
        } else {
          const body = row.responseBody;
          if (!body) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This request is already being processed.");
          await client.query("COMMIT");
          return { replay: true, cart: body };
        }
      }
    }

    const branch = await client.query<{ timezone: string }>(
      `SELECT COALESCE(b.timezone, business.timezone) AS timezone FROM branches b JOIN businesses business ON business.id = b.business_id WHERE b.id = $1 AND b.business_id = $2 AND b.active = true AND business.active = true`,
      [cart.branchId, cart.businessId]
    );
    if (!branch.rows[0]) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
    const productResult = await client.query<ProductRow>(
      `SELECT id, name, base_price AS "basePrice" FROM products WHERE id = $1 AND business_id = $2 AND active = true`,
      [input.productId, cart.businessId]
    );
    const product = productResult.rows[0];
    if (!product) throw new ApiError(409, "PRODUCT_UNAVAILABLE", "Product is unavailable.");
    const availability = await client.query<AvailabilityRow>(
      `SELECT available, available_from AS "availableFrom", available_until AS "availableUntil", schedule FROM product_branch_availability WHERE product_id = $1 AND business_id = $2 AND branch_id = $3`,
      [input.productId, cart.businessId, cart.branchId]
    );
    const availabilityRow = availability.rows[0];
    const productAvailability: ProductAvailability | null = availabilityRow
      ? {
          available: availabilityRow.available,
          availableFrom: availabilityRow.availableFrom,
          availableUntil: availabilityRow.availableUntil,
          schedule: availabilityRow.schedule as WeeklySchedule
        }
      : null;
    if (!isProductAvailable(productAvailability, new Date(), branch.rows[0].timezone)) {
      throw new ApiError(409, "PRODUCT_UNAVAILABLE", "Product is unavailable.");
    }

    let variant: VariantRow | undefined;
    if (input.variantId) {
      const variantResult = await client.query<VariantRow>(
        `SELECT id, name, price_adjustment AS "priceAdjustment" FROM product_variants WHERE id = $1 AND product_id = $2 AND business_id = $3 AND active = true`,
        [input.variantId, input.productId, cart.businessId]
      );
      variant = variantResult.rows[0];
      if (!variant) throw new ApiError(409, "PRODUCT_UNAVAILABLE", "Product variant is unavailable.");
    }
    const modifierResult = await client.query<ModifierSelectionRow>(
      `
        SELECT m.id, m.name, m.price_adjustment AS "priceAdjustment", mg.id AS "groupId",
               mg.name AS "groupName", mg.required, mg.min_selections AS "minSelections",
               mg.max_selections AS "maxSelections", mg.multi_select AS "multiSelect"
        FROM modifiers m
        JOIN modifier_groups mg ON mg.id = m.modifier_group_id
        WHERE m.id = ANY($1::uuid[]) AND m.business_id = $2 AND mg.business_id = $2 AND mg.product_id = $3 AND m.active = true
      `,
      [input.modifierIds, cart.businessId, input.productId]
    );
    if (modifierResult.rows.length !== input.modifierIds.length) {
      throw new ApiError(409, "PRODUCT_UNAVAILABLE", "One or more modifiers are unavailable.");
    }
    const groupedModifiers = new Map<string, ModifierSelectionRow[]>();
    for (const modifier of modifierResult.rows) {
      const group = groupedModifiers.get(modifier.groupId) ?? [];
      group.push(modifier);
      groupedModifiers.set(modifier.groupId, group);
    }
    const groups = await client.query<GroupRow>(
      `SELECT id, required, min_selections AS "minSelections", max_selections AS "maxSelections", multi_select AS "multiSelect" FROM modifier_groups WHERE business_id = $1 AND product_id = $2`,
      [cart.businessId, input.productId]
    );
    for (const group of groups.rows) {
      const count = groupedModifiers.get(group.id)?.length ?? 0;
      if ((group.required && count < Math.max(1, group.minSelections)) || count < group.minSelections || count > group.maxSelections) {
        throw new ApiError(400, "MODIFIER_SELECTION_INVALID", "Modifier selection does not satisfy the group rules.");
      }
      if (!group.multiSelect && count > 1) {
        throw new ApiError(400, "MODIFIER_SELECTION_INVALID", "Only one modifier may be selected.");
      }
    }
    const itemResult = await client.query<{ id: string }>(
      `
        INSERT INTO cart_items (cart_id, business_id, branch_id, product_id, product_name_snapshot, product_unit_price, variant_id, variant_name_snapshot, variant_price_adjustment, quantity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `,
      [
        cart.id,
        cart.businessId,
        cart.branchId,
        product.id,
        product.name,
        product.basePrice,
        variant?.id ?? null,
        variant?.name ?? null,
        variant?.priceAdjustment ?? 0,
        input.quantity
      ]
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error("Failed to add cart item.");
    for (const modifier of modifierResult.rows) {
      await client.query(
        `INSERT INTO cart_item_modifiers (cart_item_id, modifier_id, modifier_name_snapshot, modifier_price_adjustment) VALUES ($1, $2, $3, $4)`,
        [item.id, modifier.id, modifier.name, modifier.priceAdjustment]
      );
    }
    await client.query(`UPDATE carts SET updated_at = now(), last_active_at = now() WHERE id = $1`, [cart.id]);
    const response = await assembleCart(client, { ...cart, updatedAt: new Date() });
    if (idempotencyKey) {
      await client.query(
        `UPDATE idempotency_keys SET response_status = 201, response_body = $3::jsonb WHERE business_id = $1 AND scope = 'storefront.cart.add' AND key = $2`,
        [cart.businessId, idempotencyKey, JSON.stringify(response)]
      );
    }
    await client.query("COMMIT");
    return { replay: false, cart: response };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type CartRow = {
  id: string;
  businessId: string;
  branchId: string;
  status: string;
  source: string | null;
  startedAt: Date;
  updatedAt: Date;
};
type ProductRow = { id: string; name: string; basePrice: number };
type VariantRow = { id: string; name: string; priceAdjustment: number };
type AvailabilityRow = { available: boolean; availableFrom: Date | null; availableUntil: Date | null; schedule: unknown };
type GroupRow = { id: string; required: boolean; minSelections: number; maxSelections: number; multiSelect: boolean };
type ModifierSelectionRow = { id: string; name: string; priceAdjustment: number; groupId: string; groupName: string; required: boolean; minSelections: number; maxSelections: number; multiSelect: boolean };
export interface CartResponse {
  id: string;
  businessId: string;
  branchId: string;
  status: string;
  items: unknown[];
  totalMinor: number;
}

async function assembleCart(pool: Pool | PoolClient, cart: CartRow): Promise<CartResponse> {
  const items = await pool.query<{
    id: string;
    productId: string;
    productName: string;
    productUnitPrice: number;
    variantId: string | null;
    variantName: string | null;
    variantPriceAdjustment: number;
    quantity: number;
  }>(
    `
      SELECT id, product_id AS "productId", product_name_snapshot AS "productName",
             product_unit_price AS "productUnitPrice", variant_id AS "variantId",
             variant_name_snapshot AS "variantName", variant_price_adjustment AS "variantPriceAdjustment", quantity
      FROM cart_items WHERE cart_id = $1 ORDER BY created_at
    `,
    [cart.id]
  );
  const itemIds = items.rows.map((item) => item.id);
  const modifiers = itemIds.length
    ? await pool.query<{ cartItemId: string; id: string; name: string; priceAdjustment: number }>(
        `SELECT cart_item_id AS "cartItemId", id, modifier_name_snapshot AS name, modifier_price_adjustment AS "priceAdjustment" FROM cart_item_modifiers WHERE cart_item_id = ANY($1::uuid[])`,
        [itemIds]
      )
    : { rows: [] as Array<{ cartItemId: string; id: string; name: string; priceAdjustment: number }> };
  const modifiersByItem = new Map<string, typeof modifiers.rows>();
  for (const modifier of modifiers.rows) {
    const itemModifiers = modifiersByItem.get(modifier.cartItemId) ?? [];
    itemModifiers.push(modifier);
    modifiersByItem.set(modifier.cartItemId, itemModifiers);
  }
  const responseItems = items.rows.map((item) => {
    const itemModifiers = modifiersByItem.get(item.id) ?? [];
    const snapshot = {
      productUnitPrice: item.productUnitPrice,
      variantPriceAdjustment: item.variantPriceAdjustment,
      modifierPriceAdjustments: itemModifiers.map((modifier) => modifier.priceAdjustment)
    };
    const unit = calculateCartUnitPrice(snapshot);
    return { ...item, modifiers: itemModifiers, unitPrice: unit, lineTotal: calculateCartLineTotal(snapshot, item.quantity) };
  });
  return {
    id: cart.id,
    businessId: cart.businessId,
    branchId: cart.branchId,
    status: cart.status,
    items: responseItems,
    totalMinor: responseItems.reduce((sum, item) => sum + item.lineTotal, 0)
  };
}

async function branchTimezone(pool: Pool, businessId: string, branchId: string): Promise<string> {
  const result = await pool.query<{ timezone: string }>(
    `SELECT COALESCE(b.timezone, business.timezone) AS timezone FROM branches b JOIN businesses business ON business.id = b.business_id WHERE b.id = $1 AND b.business_id = $2 AND b.active = true`,
    [branchId, businessId]
  );
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
  return result.rows[0].timezone;
}

async function assertCategory(client: PoolClient, businessId: string, categoryId: string): Promise<void> {
  const result = await client.query(`SELECT id FROM categories WHERE id = $1 AND business_id = $2`, [categoryId, businessId]);
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Category not found.");
}

async function assertProduct(client: PoolClient, businessId: string, productId: string): Promise<void> {
  const result = await client.query(`SELECT id FROM products WHERE id = $1 AND business_id = $2`, [productId, businessId]);
  if (!result.rows[0]) throw new ApiError(404, "NOT_FOUND", "Product not found.");
}

async function withMenuTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordMenuMutation(
  client: PoolClient,
  input: {
    businessId: string;
    actor: Actor;
    action: string;
    entityType: string;
    entityId: string;
    after: unknown;
    eventType: string;
    payload: unknown;
  }
): Promise<void> {
  const audit: AuditInput = {
    businessId: input.businessId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    after: input.after,
    ipAddress: input.actor.ipAddress,
    userAgent: input.actor.userAgent
  };
  await insertAudit(client, audit);
  await client.query(
    `INSERT INTO outbox_events (business_id, event_type, aggregate_type, aggregate_id, payload) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [input.businessId, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payload)]
  );
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
