import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import {
  addCartItemRequestSchema,
  checkoutRequestSchema,
  createCartRequestSchema,
  publicMenuQuerySchema
} from "@restaurant-os/contracts";
import {
  createStorefrontSession,
  hashStorefrontSession
} from "@restaurant-os/auth";
import { ApiError } from "../errors.js";
import {
  addCartItem,
  createCart,
  findPublicBranch,
  getCart,
  getMenu,
  getPublicRestaurant
} from "../repositories/menu.js";
import { checkoutOrder } from "../repositories/orders.js";
import { parseInput } from "../validation.js";
import { createRateLimit } from "../rate-limit.js";

const storefrontCookieName = "restaurant_os_storefront";

export function registerPublicRoutes(
  app: FastifyInstance,
  pool: Pool,
  redis: Redis,
  secureCookies: boolean,
  requestsPerMinute: number,
  allowedOrigins: string[]
): void {
  const readLimit = createRateLimit(redis, "public-read", requestsPerMinute);
  const writeLimit = createRateLimit(redis, "public-write", Math.max(10, Math.floor(requestsPerMinute / 4)));

  app.get("/v1/public/restaurants/:slug", { preHandler: [readLimit] }, async (request) => {
    const { slug } = request.params as { slug: string };
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    return { restaurant };
  });

  app.get("/v1/public/restaurants/:slug/menu", { preHandler: [readLimit] }, async (request) => {
    const { slug } = request.params as { slug: string };
    const query = parseInput(publicMenuQuerySchema, request.query);
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    const branch = await findPublicBranch(pool, restaurant.id, query.branchSlug);
    if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
    const menu = await getMenu(pool, restaurant.id, branch.id, true);
    return { restaurant, branch, menu };
  });

  app.post("/v1/public/restaurants/:slug/carts", { preHandler: [writeLimit] }, async (request, reply) => {
    assertAllowedOrigin(request, allowedOrigins);
    const { slug } = request.params as { slug: string };
    const input = parseInput(createCartRequestSchema, request.body);
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    const branch = await findPublicBranch(pool, restaurant.id, input.branchSlug);
    if (!branch) throw new ApiError(404, "NOT_FOUND", "Branch not found.");
    const existingSession = request.cookies[storefrontCookieName];
    const session = existingSession ?? createStorefrontSession();
    const cart = await createCart(pool, restaurant.id, branch.id, hashStorefrontSession(session), input.source);
    if (!existingSession) setStorefrontCookie(reply, session, secureCookies);
    return reply.code(201).send({ cart, restaurant, branch });
  });

  app.get("/v1/public/restaurants/:slug/carts/me", { preHandler: [readLimit] }, async (request) => {
    const { slug } = request.params as { slug: string };
    const session = request.cookies[storefrontCookieName];
    if (!session) throw new ApiError(401, "CART_SESSION_MISSING", "Cart session is required.");
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    return { cart: await getCart(pool, hashStorefrontSession(session), undefined, restaurant.id) };
  });

  app.post("/v1/public/restaurants/:slug/carts/me/items", { preHandler: [writeLimit] }, async (request) => {
    assertAllowedOrigin(request, allowedOrigins);
    const { slug } = request.params as { slug: string };
    const session = request.cookies[storefrontCookieName];
    if (!session) throw new ApiError(401, "CART_SESSION_MISSING", "Cart session is required.");
    const input = parseInput(addCartItemRequestSchema, request.body);
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    const idempotencyKey = headerValue(request, "idempotency-key");
    const result = await addCartItem(
      pool,
      hashStorefrontSession(session),
      restaurant.id,
      input,
      idempotencyKey,
      createRequestHash({ sessionHash: hashStorefrontSession(session), input })
    );
    return result.cart;
  });

  app.post("/v1/public/restaurants/:slug/checkout", { preHandler: [writeLimit] }, async (request, reply) => {
    assertAllowedOrigin(request, allowedOrigins);
    const { slug } = request.params as { slug: string };
    const session = request.cookies[storefrontCookieName];
    if (!session) throw new ApiError(401, "CART_SESSION_MISSING", "Cart session is required.");
    const idempotencyKey = headerValue(request, "idempotency-key");
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key header must contain 8 to 100 characters.");
    }
    const input = parseInput(checkoutRequestSchema, request.body);
    const restaurant = await getPublicRestaurant(pool, slug);
    if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
    const sessionHash = hashStorefrontSession(session);
    const result = await checkoutOrder(
      pool,
      sessionHash,
      restaurant.id,
      input,
      idempotencyKey,
      createRequestHash({ sessionHash, input })
    );
    return reply.code(result.replay ? 200 : 201).send({ order: result.order });
  });
}

function setStorefrontCookie(reply: FastifyReply, value: string, secure: boolean): void {
  reply.setCookie(storefrontCookieName, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/v1/public",
    maxAge: 30 * 24 * 60 * 60
  });
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function createRequestHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function assertAllowedOrigin(request: FastifyRequest, allowedOrigins: string[]): void {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    throw new ApiError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }
}
