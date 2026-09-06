# Deployment

Local infrastructure is defined in `docker-compose.yml` and currently contains
PostgreSQL and Redis. Public application, API, webhook, and provider endpoints
must use HTTPS in deployed environments. Keep staging databases, Redis,
Evolution instances, n8n environments, and test chats separate from
production.

The deployment command surface is intentionally defined by the root scripts and
must be kept in sync with this document as the workspace grows.

Coolify uses `docker-compose.coolify.yml` from the private Git repository. The
API container applies ordered migrations before starting. `api`, `admin`,
`storefront`, and (once its domain/basic-auth are configured) `n8n` each
receive their own public domain via Coolify's per-service `docker_compose_domains`
setting; PostgreSQL, Redis, and n8n's data volume are internal services with
persistent volumes. `admin`/`storefront` need `NEXT_PUBLIC_API_URL` set as a
**build-time** Coolify environment variable (Next.js inlines it into the
client bundle, so it must be correct before `pnpm build` runs, not just at
container start).

`EVOLUTION_BASE_URL`/`EVOLUTION_GLOBAL_API_KEY` and `N8N_BASE_URL`/
`N8N_INBOUND_SECRET` must be set to real values before WhatsApp connections
or outbound notifications work — see ADR-009. Until a real Evolution/n8n
deployment exists, these default to local placeholders and
`POST /v1/integrations/whatsapp/connect` will fail.
