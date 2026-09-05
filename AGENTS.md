# Restaurant OS

## Source Of Truth

- Read `RESTAURANT_OS_MASTER_PLAN.md` at the repository root before architecture or product work. The plan's `docs/` path is a future layout; use `docs/RESTAURANT_OS_MASTER_PLAN.md` only after the file is actually moved there.
- Read `docs/DECISIONS.md` before changing an accepted architectural decision. Record any required change as an ADR before implementing it.
- Repository code and docs are authoritative over `opencode-mem`. Never put secrets or customer PII in either memory or documentation.

## Current State

- At the initial handoff, the repository had only the master plan and no verified build, test, lint, migration, or dev-server commands. Check current manifests and scripts first; do not invent commands or claim production readiness before Phase 0 creates and verifies them.
- Phase 0 must establish the planned pnpm monorepo, strict TypeScript, Docker Compose, PostgreSQL, Redis, environment validation, migrations, CI, tests, and project docs.
- The current foundation commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`; run them after changes. `pnpm db:migrate` requires PostgreSQL to be running, normally via `docker compose up -d postgres redis`.
- Planned boundaries are `apps/{admin,storefront,api,worker,print-agent}`, `packages/{db,auth,domain,ui,contracts,analytics,integrations,config}`, provider adapters under `integrations/`, versioned workflows under `n8n/workflows/`, and `tests/{e2e,fixtures}`. Verify the actual tree before editing.

## Non-Negotiable Architecture

- This is a multi-tenant SaaS from day one. Enforce server-side `business_id` and applicable `branch_id` scoping on every tenant-owned read and write; never trust a client-supplied tenant ID.
- Keep order totals, pricing, discounts/coupons, stock/availability, order creation/state, payments, authorization, loyalty, and rewards in deterministic, tested Core API code (Fastify + TypeScript), never in n8n.
- Do not add Hermes or any runtime LLM dependency. The product must work without AI.
- Store loyalty changes in a transaction ledger (`loyalty_transactions`), consume claim tokens atomically and once, and keep materialized balances derived from ledger activity.
- Recompute order totals from database state on the server and persist immutable product/price snapshots in order items; client totals are untrusted.
- Make every external webhook and callback idempotent, including Evolution, payment, Telegram/n8n, loyalty, order submission, and print acknowledgements. Persist domain events with the state change through a transactional outbox before external side effects.
- Put Evolution API behind an integration/provider adapter; verify the deployed provider's endpoints, authentication, webhook payloads, and `MESSAGES_UPSERT` behavior in staging before relying on them.

## Security And Verification

- Validate API boundaries with Zod and keep `/v1` OpenAPI contracts and stable error codes current. Every schema change requires a migration.
- Audit sensitive mutations, including role changes, impersonation, loyalty adjustments/redemptions, cancellations/refunds, secret changes, subscriptions, and PII exports.
- Marketing messages require explicit consent, opt-out handling, frequency caps, quiet hours, and duplicate suppression.
- Tenant-isolation integration tests are mandatory. Cover cross-tenant reads/exports/campaigns/loyalty, role boundaries, expired or reused signed tokens, duplicate webhooks/orders, and branch-scoped print jobs. Add a regression test for every bug fix.
- For each task: inspect existing code/config first, make the smallest coherent change, update behavior docs, then run the repository's configured lint, typecheck, focused tests, and relevant E2E checks. Do not silently change accepted requirements.

## Delivery Order

- Follow the plan's phases: foundation; identity/multi-tenancy/super-admin; menu/storefront; order engine; Evolution/CRM; loyalty; outbox + n8n/Telegram/printer; campaigns/segmentation; analytics; SaaS billing; hardening.
- Keep optional later scope out unless explicitly requested: native mobile, courier app, inventory/procurement/accounting, POS hardware integration, marketplace sync, recommendation ML, and AI-generated campaigns.
