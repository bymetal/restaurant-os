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
