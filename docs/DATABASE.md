# Database

`packages/db/migrations/0001_foundation.sql` creates the initial platform,
business, branch, membership, outbox, idempotency, and audit tables.

`0002_auth_roles_audit.sql` adds credentials, refresh-token families,
platform-role assignments, audit before/after fields, role/permission seeds, and
the partial unique index required for platform-level idempotency.

`0003_menu_storefront.sql` adds branch slugs, categories, products, variants,
modifier groups/items, branch availability overrides, and server-side carts with
price snapshots. Money values are integer minor units.

`0004_order_engine.sql` adds customers, delivery zones, orders, immutable order
item snapshots, order events, offline payments, and order adjustments. The
`orders` total consistency check is a database backstop; totals are calculated
by Core API before insertion.

`0005_loyalty.sql` adds `loyalty_programs` (one active program per business),
`loyalty_accounts` (materialized per-customer balances), and the
`loyalty_transactions` ledger. Every earn, manual adjustment, and redemption is
an immutable ledger row; account balances are derived from and only ever
updated alongside a ledger insert in the same transaction. A partial unique
index on `(business_id, idempotency_key)` makes ledger writes idempotent
without a separate claim-token table. `carts.customer_id` links a storefront
session to the customer recognized during checkout so the public storefront
can show loyalty progress on return visits.

`0006_crm.sql` extends `customers` with segment/acquisition/preference fields
and adds `customer_notes` and `customer_tags`. No separate customer-events
table exists; the interaction timeline is assembled from `order_events`,
`loyalty_transactions`, and `customer_notes` with a `UNION ALL` at query time.

`0007_campaigns.sql` adds `campaigns` (coupon-code discounts with a draft →
active → paused/completed/archived state machine), a `campaign_id` column on
`order_adjustments`, and `campaign_events`. Checkout resolves and locks the
campaign row in the same transaction as order creation, so the redemption
limit is race-free.

`0008_business_analytics.sql` adds only the `business:analytics:read`
permission; every analytics endpoint is a read-only aggregate over existing
`orders`/`order_items`/`loyalty_accounts` data, so no new tables are needed.

`0009_platform_analytics.sql` adds `billing_plans` (seeded Starter/Growth/Pro),
`business_subscriptions` (which plan a business is on; no payment provider),
`integration_health`, and `system_issues`. The latter two are real,
queryable tables that start empty and stay empty until a future
Evolution/printer-agent/n8n phase writes to them — the platform dashboard
never fabricates a connection status or issue count.

`0010_evolution_whatsapp.sql` adds the WhatsApp/Evolution schema:
`integration_connections` (one row per business+provider, encrypted instance
credential, connection/webhook state — `integration_health` is kept as a
lighter-weight status cache updated whenever this table's state changes),
`customer_consents` (TRANSACTIONAL/MARKETING/LOYALTY, latest row per type
wins, opt-out never auto-reverses), `loyalty_claim_tokens` (single-use,
hash-stored, atomically consumed via `UPDATE ... WHERE consumed_at IS NULL`),
`webhook_events` (dedupe by `connection_id`+`provider_event_id`), `qr_codes`,
and `acquisition_events`. See ADR-009 for the full design rationale.

Apply migrations with:

```powershell
pnpm db:migrate
```

Every schema change must be an ordered SQL migration. Domain state changes and
their `outbox_events` records must be committed in the same database
transaction. Tenant-owned tables must carry `business_id` and `branch_id` when
the domain is branch-scoped.

Checkout closes the active cart and creates its order, payment, event, and
outbox record atomically. The `Idempotency-Key` is required and expires after
24 hours.

Seed a development super admin only with explicit environment values:

```powershell
pnpm db:seed
```
