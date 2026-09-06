# Restaurant OS

Restaurant OS is a multi-tenant restaurant SaaS. The product plan is in
`RESTAURANT_OS_MASTER_PLAN.md` at the repository root until it is moved into
`docs/`.

## Requirements

- Node.js 22 or newer
- pnpm 11
- Docker Desktop for PostgreSQL and Redis

## Local Setup

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The API listens on `http://127.0.0.1:4000`. Liveness is available at
`/health/live`; readiness checks PostgreSQL and Redis at `/health/ready`.

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in the local environment
before running `pnpm db:seed`. Never use production credentials in local files.

## Coolify Deployment

`docker-compose.coolify.yml` is the deployment stack for Coolify. It runs the
API, worker, PostgreSQL, and Redis in one isolated resource with persistent
database volumes. Configure the required environment variables in Coolify;
never commit production secrets.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

Run `pnpm db:migrate` after starting PostgreSQL and whenever a new migration is
added. Schema changes must be represented by a new ordered SQL migration.

## Layout

- `apps/api`: Fastify HTTP API and infrastructure health endpoints
- `apps/worker`: background worker process boundary
- `packages/config`: validated runtime environment
- `packages/contracts`: shared Zod API contracts
- `packages/domain`: framework-independent domain types
- `packages/db`: PostgreSQL client and migrations
- `packages/auth`: password, JWT, and anonymous storefront session primitives
- `docs/`: architecture, security, deployment, and decision records
- `n8n/workflows/`: versioned automation workflow boundary
