import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  customerIdParamsSchema,
  customerListQuerySchema,
  customerNoteRequestSchema,
  customerTagIdParamsSchema,
  customerTagRequestSchema,
  updateCustomerRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  addCustomerNote,
  addCustomerTag,
  getCustomerDetail,
  getCustomerTimeline,
  getFavoriteProducts,
  listCustomerNotes,
  listCustomers,
  listCustomerTags,
  removeCustomerTag,
  updateCustomer
} from "../repositories/customers.js";
import { parseInput } from "../validation.js";

export function registerCustomerRoutes(app: FastifyInstance, pool: Pool): void {
  const readAccess = [app.authenticate, app.requireScope("business"), app.requirePermission("business:customer:read")];
  const writeAccess = [app.authenticate, app.requireScope("business"), app.requirePermission("business:customer:write")];

  app.get("/v1/customers", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { customers: await listCustomers(pool, context.businessId, parseInput(customerListQuerySchema, request.query)) };
  });

  app.get("/v1/customers/:customerId", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    const customer = await getCustomerDetail(pool, context.businessId, customerId);
    if (!customer) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    return { customer };
  });

  app.put("/v1/customers/:customerId", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    const input = parseInput(updateCustomerRequestSchema, request.body);
    return { customer: await updateCustomer(pool, context.businessId, customerId, input, actorFrom(request)) };
  });

  app.get("/v1/customers/:customerId/favorites", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    return { favorites: await getFavoriteProducts(pool, context.businessId, customerId, 5) };
  });

  app.get("/v1/customers/:customerId/timeline", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    return { timeline: await getCustomerTimeline(pool, context.businessId, customerId, 30) };
  });

  app.get("/v1/customers/:customerId/notes", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    return { notes: await listCustomerNotes(pool, context.businessId, customerId) };
  });

  app.post("/v1/customers/:customerId/notes", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    const input = parseInput(customerNoteRequestSchema, request.body);
    return { note: await addCustomerNote(pool, context.businessId, customerId, input, actorFrom(request)) };
  });

  app.get("/v1/customers/:customerId/tags", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    return { tags: await listCustomerTags(pool, context.businessId, customerId) };
  });

  app.post("/v1/customers/:customerId/tags", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId } = parseInput(customerIdParamsSchema, request.params);
    const input = parseInput(customerTagRequestSchema, request.body);
    return { tag: await addCustomerTag(pool, context.businessId, customerId, input, actorFrom(request)) };
  });

  app.delete("/v1/customers/:customerId/tags/:tagId", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const { customerId, tagId } = parseInput(customerTagIdParamsSchema, request.params);
    await removeCustomerTag(pool, context.businessId, customerId, tagId);
    return { success: true };
  });
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}

function actorFrom(request: FastifyRequest) {
  const context = requireBusiness(request);
  return {
    userId: context.userId,
    role: context.role,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}
