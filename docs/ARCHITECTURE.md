# Architecture

The platform is multi-tenant from the first migration. `businesses` represent
restaurants and `branches` represent physical locations. Tenant-owned access
must derive the business and branch scope from authenticated server context.

The current foundation is:

```text
Fastify API -> PostgreSQL
           -> Redis
           -> transactional outbox -> future worker/integration adapters
```

The planned workspace boundaries are documented in `AGENTS.md` and the master
plan. Critical ordering, payment, loyalty, reward, authorization, and tenant
logic belongs in the Core API. n8n is reserved for automation and integration
orchestration.

Phase 2 adds a tenant-scoped menu management API and unauthenticated public
storefront reads under `/v1/public/restaurants/:slug`. Public cart sessions use
an opaque HttpOnly cookie whose SHA-256 hash is stored in PostgreSQL. Product
prices and modifier rules are loaded from the database; checkout and order
creation remain Phase 3 responsibilities.
