# Database

`packages/db/migrations/0001_foundation.sql` creates the initial platform,
business, branch, membership, outbox, idempotency, and audit tables.

`0002_auth_roles_audit.sql` adds credentials, refresh-token families,
platform-role assignments, audit before/after fields, role/permission seeds, and
the partial unique index required for platform-level idempotency.

Apply migrations with:

```powershell
pnpm db:migrate
```

Every schema change must be an ordered SQL migration. Domain state changes and
their `outbox_events` records must be committed in the same database
transaction. Tenant-owned tables must carry `business_id` and `branch_id` when
the domain is branch-scoped.

Seed a development super admin only with explicit environment values:

```powershell
pnpm db:seed
```
