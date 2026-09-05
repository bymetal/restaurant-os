# Database

`packages/db/migrations/0001_foundation.sql` creates the initial platform,
business, branch, membership, outbox, idempotency, and audit tables.

Apply migrations with:

```powershell
pnpm db:migrate
```

Every schema change must be an ordered SQL migration. Domain state changes and
their `outbox_events` records must be committed in the same database
transaction. Tenant-owned tables must carry `business_id` and `branch_id` when
the domain is branch-scoped.
